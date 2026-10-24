"""Neo4j graph store interface for dependency queries and code relationships."""
from __future__ import annotations

import logging
from typing import Any, Sequence

from neo4j import Driver, GraphDatabase
from neo4j.exceptions import Neo4jError

from app.config import settings
from app.models import Chunk, Edge

logger = logging.getLogger(__name__)

_driver: Driver | None = None
BATCH_SIZE = 500


def get_driver() -> Driver:
    """Return a shared Neo4j driver instance, initializing it if necessary."""
    global _driver
    if _driver is None:
        _driver = GraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
        )
    return _driver


def close_driver() -> None:
    """Close and reset the active Neo4j driver connection."""
    global _driver
    if _driver is not None:
        _driver.close()
        _driver = None


def _chunk_list(items: Sequence[Any], size: int) -> list[Sequence[Any]]:
    """Split a sequence into batches of at most `size` items."""
    return [items[i : i + size] for i in range(0, len(items), size)]


def ensure_schema(driver: Driver | None = None) -> None:
    """Create uniqueness constraints or indexes for Function, Class, and File nodes.

    Uses `IF NOT EXISTS`. If composite uniqueness constraints are unsupported on
    the current Neo4j edition, falls back to composite b-tree/range indexes.
    """
    drv = driver or get_driver()
    targets = [
        ("function_repo_qname_unique", "Function", ["repo_id", "qualified_name"]),
        ("class_repo_qname_unique", "Class", ["repo_id", "qualified_name"]),
        ("file_repo_path_unique", "File", ["repo_id", "path"]),
    ]

    with drv.session() as session:
        for name, label, props in targets:
            props_str = ", ".join(f"n.{p}" for p in props)
            constraint_cypher = (
                f"CREATE CONSTRAINT {name} IF NOT EXISTS "
                f"FOR (n:{label}) REQUIRE ({props_str}) IS UNIQUE"
            )
            try:
                session.run(constraint_cypher).consume()
            except Neo4jError as err:
                logger.info(
                    "Constraint '%s' failed on this edition (%s); falling back to composite index.",
                    name,
                    err,
                )
                index_name = f"{name}_idx"
                index_cypher = (
                    f"CREATE INDEX {index_name} IF NOT EXISTS "
                    f"FOR (n:{label}) ON ({props_str})"
                )
                session.run(index_cypher).consume()


def clear_repo(repo_id: str, driver: Driver | None = None) -> None:
    """Delete every node and relationship associated with repo_id."""
    drv = driver or get_driver()
    query = """
    MATCH (n {repo_id: $repo_id})
    DETACH DELETE n
    """
    with drv.session() as session:
        session.run(query, repo_id=repo_id).consume()


def write_chunks(
    repo_id: str,
    chunks: list[Chunk],
    driver: Driver | None = None,
) -> None:
    """Merge File, Class, and Function nodes and CONTAINS relationships from chunks.

    Only processes function, method, and class chunks. Batches writes using UNWIND.
    """
    drv = driver or get_driver()
    valid_chunks = [
        c for c in chunks if c.node_type in ("function", "method", "class")
    ]
    if not valid_chunks:
        return

    # 1. Unique file paths
    file_rows = [{"path": path} for path in sorted({c.file_path for c in valid_chunks})]

    # 2. Classes
    class_chunks = [c for c in valid_chunks if c.node_type == "class"]
    class_rows = [
        {
            "qualified_name": c.qualified_name,
            "file_path": c.file_path,
            "start_line": c.start_line,
            "end_line": c.end_line,
        }
        for c in class_chunks
    ]

    # 3. Functions & Methods
    func_chunks = [c for c in valid_chunks if c.node_type in ("function", "method")]
    func_rows = [
        {
            "qualified_name": c.qualified_name,
            "file_path": c.file_path,
            "start_line": c.start_line,
            "end_line": c.end_line,
            "is_method": c.node_type == "method",
        }
        for c in func_chunks
    ]

    # 4. CONTAINS relationships:
    # (File)-[:CONTAINS]->(Class)
    file_class_rows = [
        {"file_path": c.file_path, "qualified_name": c.qualified_name}
        for c in class_chunks
    ]

    # (File)-[:CONTAINS]->(Function) [top-level functions only]
    file_func_rows = [
        {"file_path": c.file_path, "qualified_name": c.qualified_name}
        for c in func_chunks
        if c.node_type == "function"
    ]

    # (Class)-[:CONTAINS]->(Function) [methods]
    method_chunks = [c for c in func_chunks if c.node_type == "method"]
    class_method_rows = []
    for c in method_chunks:
        # Determine parent class qualified name
        parent_qname: str | None = None
        if c.parent_name and "." in c.parent_name:
            parent_qname = c.parent_name
        elif "." in c.qualified_name:
            parent_qname = c.qualified_name.rsplit(".", 1)[0]
        else:
            parent_qname = c.parent_name

        class_method_rows.append(
            {
                "file_path": c.file_path,
                "class_qname": parent_qname,
                "parent_name": c.parent_name,
                "qualified_name": c.qualified_name,
            }
        )

    with drv.session() as session:
        # Batch merge Files
        for batch in _chunk_list(file_rows, BATCH_SIZE):
            session.run(
                """
                UNWIND $batch AS row
                MERGE (f:File {repo_id: $repo_id, path: row.path})
                ON CREATE SET f.file_path = row.path
                """,
                repo_id=repo_id,
                batch=batch,
            ).consume()

        # Batch merge Classes
        for batch in _chunk_list(class_rows, BATCH_SIZE):
            session.run(
                """
                UNWIND $batch AS row
                MERGE (c:Class {repo_id: $repo_id, qualified_name: row.qualified_name})
                ON CREATE SET c.file_path = row.file_path,
                              c.start_line = row.start_line,
                              c.end_line = row.end_line
                ON MATCH SET c.file_path = row.file_path,
                             c.start_line = CASE WHEN row.start_line < c.start_line THEN row.start_line ELSE c.start_line END,
                             c.end_line = CASE WHEN row.end_line > c.end_line THEN row.end_line ELSE c.end_line END
                """,
                repo_id=repo_id,
                batch=batch,
            ).consume()

        # Batch merge Functions & Methods
        for batch in _chunk_list(func_rows, BATCH_SIZE):
            session.run(
                """
                UNWIND $batch AS row
                MERGE (fn:Function {repo_id: $repo_id, qualified_name: row.qualified_name})
                ON CREATE SET fn.file_path = row.file_path,
                              fn.start_line = row.start_line,
                              fn.end_line = row.end_line,
                              fn.is_method = row.is_method
                ON MATCH SET fn.file_path = row.file_path,
                             fn.start_line = CASE WHEN row.start_line < fn.start_line THEN row.start_line ELSE fn.start_line END,
                             fn.end_line = CASE WHEN row.end_line > fn.end_line THEN row.end_line ELSE fn.end_line END,
                             fn.is_method = row.is_method
                """,
                repo_id=repo_id,
                batch=batch,
            ).consume()

        # Batch merge (File)-[:CONTAINS]->(Class)
        for batch in _chunk_list(file_class_rows, BATCH_SIZE):
            session.run(
                """
                UNWIND $batch AS row
                MATCH (f:File {repo_id: $repo_id, path: row.file_path})
                MATCH (c:Class {repo_id: $repo_id, qualified_name: row.qualified_name})
                MERGE (f)-[:CONTAINS]->(c)
                """,
                repo_id=repo_id,
                batch=batch,
            ).consume()

        # Batch merge (File)-[:CONTAINS]->(Function)
        for batch in _chunk_list(file_func_rows, BATCH_SIZE):
            session.run(
                """
                UNWIND $batch AS row
                MATCH (f:File {repo_id: $repo_id, path: row.file_path})
                MATCH (fn:Function {repo_id: $repo_id, qualified_name: row.qualified_name})
                MERGE (f)-[:CONTAINS]->(fn)
                """,
                repo_id=repo_id,
                batch=batch,
            ).consume()

        # Batch merge (Class)-[:CONTAINS]->(Function)
        for batch in _chunk_list(class_method_rows, BATCH_SIZE):
            session.run(
                """
                UNWIND $batch AS row
                MATCH (fn:Function {repo_id: $repo_id, qualified_name: row.qualified_name})
                OPTIONAL MATCH (c:Class {repo_id: $repo_id})
                WHERE c.qualified_name = row.class_qname
                   OR (row.parent_name IS NOT NULL AND c.qualified_name ENDS WITH ("." + row.parent_name))
                   OR (row.parent_name IS NOT NULL AND c.qualified_name = row.parent_name)
                FOREACH (_ IN CASE WHEN c IS NOT NULL THEN [1] ELSE [] END |
                    MERGE (c)-[:CONTAINS]->(fn)
                )
                // If no matching class exists, connect directly to File as fallback
                FOREACH (_ IN CASE WHEN c IS NULL THEN [1] ELSE [] END |
                    MERGE (f:File {repo_id: $repo_id, path: row.file_path})
                    MERGE (f)-[:CONTAINS]->(fn)
                )
                """,
                repo_id=repo_id,
                batch=batch,
            ).consume()


def write_edges(
    repo_id: str,
    edges: list[Edge],
    driver: Driver | None = None,
) -> None:
    """Merge CALLS and IMPORTS relationships for resolved edges only, in batches."""
    drv = driver or get_driver()
    resolved_edges = [e for e in edges if e.resolved]
    if not resolved_edges:
        return

    calls_rows = [
        {"source": e.source_qualified_name, "target": e.target_qualified_name}
        for e in resolved_edges
        if e.type == "CALLS"
    ]

    imports_rows = [
        {"source": e.source_qualified_name, "target": e.target_qualified_name}
        for e in resolved_edges
        if e.type == "IMPORTS"
    ]

    with drv.session() as session:
        # Merge CALLS: (Function)->(Function)
        for batch in _chunk_list(calls_rows, BATCH_SIZE):
            session.run(
                """
                UNWIND $batch AS row
                MERGE (s:Function {repo_id: $repo_id, qualified_name: row.source})
                MERGE (t:Function {repo_id: $repo_id, qualified_name: row.target})
                MERGE (s)-[:CALLS]->(t)
                """,
                repo_id=repo_id,
                batch=batch,
            ).consume()

        # Merge IMPORTS: (File)->(File)
        for batch in _chunk_list(imports_rows, BATCH_SIZE):
            session.run(
                """
                UNWIND $batch AS row
                MERGE (s:File {repo_id: $repo_id, path: row.source})
                ON CREATE SET s.file_path = row.source
                MERGE (t:File {repo_id: $repo_id, path: row.target})
                ON CREATE SET t.file_path = row.target
                MERGE (s)-[:IMPORTS]->(t)
                """,
                repo_id=repo_id,
                batch=batch,
            ).consume()


def callees(
    repo_id: str,
    qualified_name: str,
    driver: Driver | None = None,
) -> list[dict[str, Any]]:
    """Return all functions called by the given function qualified name.

    Each dict has: qualified_name, file_path, start_line, end_line.
    """
    drv = driver or get_driver()
    query = """
    MATCH (caller:Function {repo_id: $repo_id, qualified_name: $qualified_name})-[:CALLS]->(callee:Function)
    RETURN callee.qualified_name AS qualified_name,
           callee.file_path AS file_path,
           callee.start_line AS start_line,
           callee.end_line AS end_line
    ORDER BY qualified_name
    """
    with drv.session() as session:
        records = session.run(
            query,
            repo_id=repo_id,
            qualified_name=qualified_name,
        ).data()

    return [
        {
            "qualified_name": r["qualified_name"],
            "file_path": r.get("file_path"),
            "start_line": r.get("start_line"),
            "end_line": r.get("end_line"),
        }
        for r in records
    ]


def callers(
    repo_id: str,
    qualified_name: str,
    driver: Driver | None = None,
) -> list[dict[str, Any]]:
    """Return all functions that call the given function qualified name.

    Each dict has: qualified_name, file_path, start_line, end_line.
    """
    drv = driver or get_driver()
    query = """
    MATCH (caller:Function)-[:CALLS]->(callee:Function {repo_id: $repo_id, qualified_name: $qualified_name})
    RETURN caller.qualified_name AS qualified_name,
           caller.file_path AS file_path,
           caller.start_line AS start_line,
           caller.end_line AS end_line
    ORDER BY qualified_name
    """
    with drv.session() as session:
        records = session.run(
            query,
            repo_id=repo_id,
            qualified_name=qualified_name,
        ).data()

    return [
        {
            "qualified_name": r["qualified_name"],
            "file_path": r.get("file_path"),
            "start_line": r.get("start_line"),
            "end_line": r.get("end_line"),
        }
        for r in records
    ]


def file_imports(
    repo_id: str,
    file_path: str,
    driver: Driver | None = None,
) -> list[dict[str, Any]]:
    """Return all files imported by the specified file path.

    Each dict has: qualified_name, file_path, start_line, end_line.
    """
    drv = driver or get_driver()
    query = """
    MATCH (f1:File {repo_id: $repo_id})
    WHERE f1.path = $file_path OR f1.file_path = $file_path
    MATCH (f1)-[:IMPORTS]->(f2:File)
    RETURN coalesce(f2.qualified_name, f2.path) AS qualified_name,
           coalesce(f2.file_path, f2.path) AS file_path,
           f2.start_line AS start_line,
           f2.end_line AS end_line
    ORDER BY file_path
    """
    with drv.session() as session:
        records = session.run(
            query,
            repo_id=repo_id,
            file_path=file_path,
        ).data()

    return [
        {
            "qualified_name": (
                r["qualified_name"] if r["qualified_name"] is not None else r["file_path"]
            ),
            "file_path": r["file_path"],
            "start_line": r.get("start_line"),
            "end_line": r.get("end_line"),
        }
        for r in records
    ]


def graph_counts(
    repo_id: str,
    driver: Driver | None = None,
) -> dict[str, int]:
    """Return node and edge counts per type for the given repo_id."""
    drv = driver or get_driver()
    node_query = """
    MATCH (n {repo_id: $repo_id})
    RETURN head(labels(n)) AS label, count(n) AS count
    """
    edge_query = """
    MATCH (a {repo_id: $repo_id})-[r]->(b {repo_id: $repo_id})
    RETURN type(r) AS type, count(r) AS count
    """

    counts: dict[str, int] = {
        "File": 0,
        "Class": 0,
        "Function": 0,
        "CONTAINS": 0,
        "CALLS": 0,
        "IMPORTS": 0,
    }

    with drv.session() as session:
        node_records = session.run(node_query, repo_id=repo_id).data()
        for r in node_records:
            lbl = r["label"]
            if lbl in counts:
                counts[lbl] = r["count"]

        edge_records = session.run(edge_query, repo_id=repo_id).data()
        for r in edge_records:
            rtype = r["type"]
            if rtype in counts:
                counts[rtype] = r["count"]

    # Add convenient aliases
    counts["files"] = counts["File"]
    counts["classes"] = counts["Class"]
    counts["functions"] = counts["Function"]
    counts["contains"] = counts["CONTAINS"]
    counts["calls"] = counts["CALLS"]
    counts["imports"] = counts["IMPORTS"]
    counts["total_nodes"] = counts["File"] + counts["Class"] + counts["Function"]
    counts["total_edges"] = counts["CONTAINS"] + counts["CALLS"] + counts["IMPORTS"]
    counts["nodes"] = counts["total_nodes"]
    counts["edges"] = counts["total_edges"]

    return counts


class GraphStore:
    """Convenience wrapper for repository graph operations."""

    def __init__(self, repo_id: str, driver: Driver | None = None) -> None:
        self.repo_id = repo_id
        self.driver = driver or get_driver()

    def ensure_schema(self) -> None:
        ensure_schema(driver=self.driver)

    def clear(self) -> None:
        clear_repo(self.repo_id, driver=self.driver)

    def write_chunks(self, chunks: list[Chunk]) -> None:
        write_chunks(self.repo_id, chunks, driver=self.driver)

    def write_edges(self, edges: list[Edge]) -> None:
        write_edges(self.repo_id, edges, driver=self.driver)

    def callees(self, qualified_name: str) -> list[dict[str, Any]]:
        return callees(self.repo_id, qualified_name, driver=self.driver)

    def callers(self, qualified_name: str) -> list[dict[str, Any]]:
        return callers(self.repo_id, qualified_name, driver=self.driver)

    def file_imports(self, file_path: str) -> list[dict[str, Any]]:
        return file_imports(self.repo_id, file_path, driver=self.driver)

    def counts(self) -> dict[str, int]:
        return graph_counts(self.repo_id, driver=self.driver)
