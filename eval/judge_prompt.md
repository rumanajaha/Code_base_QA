# LLM Judge Evaluation Prompt

You are evaluating an answer produced by a Codebase QA RAG assistant.

## Evaluation Criteria
1. **Correctness**: Does the answer correctly answer the developer's question?
2. **Grounding & Faithfulness**: Are all statements supported by the provided citations and retrieved code snippets?
3. **Citation Precision**: Do the cited line numbers and file paths accurately map to relevant code?
4. **Completeness**: Are key dependencies, call paths, or edge cases properly addressed?

## Instructions
Review the user question, the retrieved context, and the generated answer with citations. Score the response from 1 to 5 for each criterion and provide a brief rationale.
