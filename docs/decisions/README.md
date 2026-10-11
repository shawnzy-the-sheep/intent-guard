# Architecture decisions

| ADR | Decision                              | Consequence                                                              |
| --- | ------------------------------------- | ------------------------------------------------------------------------ |
| 001 | UX Contracts live in Git              | Intent changes can be reviewed beside implementation                     |
| 002 | Semantic results do not block v0.1 CI | ERROR exits 1; PASS/REVIEW/INCONCLUSIVE exit 0                           |
| 003 | Browser evidence precedes reasoning   | Models cite captured IDs, never invented facts                           |
| 004 | Accessibility stays deterministic     | axe summary is separate from semantic evaluation                         |
| 005 | Provider interface is replaceable     | Mock and OpenAI today; additional/local adapters later                   |
| 006 | Full DOM is not sent by default       | Limited semantic extraction, selector-based masking, 400-element cap     |
| 007 | Contracts declare meaning, not style  | Heuristic features do not freeze CSS                                     |
| 008 | Default provider is none              | Credential absence never silently invokes mock or produces semantic PASS |
| 009 | Debug uses safe stage events          | Raw browser traces omitted due to network/storage secret exposure        |
| 010 | Rank task content actions in main     | Global navigation cannot create task action false positives              |
