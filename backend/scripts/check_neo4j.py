"""Smoke test for Neo4j connectivity and basic node operations."""
import uuid

from neo4j import GraphDatabase

from backend.app.config import settings


def main() -> None:
    driver = GraphDatabase.driver(
        settings.NEO4J_URI,
        auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
    )
    test_id = str(uuid.uuid4())

    try:
        driver.verify_connectivity()
        with driver.session() as session:
            session.run(
                "CREATE (n:SmokeTest {test_id: $test_id})",
                test_id=test_id,
            ).consume()

            record = session.run(
                "MATCH (n:SmokeTest {test_id: $test_id}) "
                "RETURN n.test_id AS test_id",
                test_id=test_id,
            ).single()

            if record is None or record["test_id"] != test_id:
                raise RuntimeError("Could not read back the temporary Neo4j node.")

            session.run(
                "MATCH (n:SmokeTest {test_id: $test_id}) DELETE n",
                test_id=test_id,
            ).consume()

        print("PASS: Neo4j connectivity, create/read/delete")
    finally:
        driver.close()


if __name__ == "__main__":
    main()