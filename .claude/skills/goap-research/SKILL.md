---
name: goap-research
description: Goal-Oriented Action Planning (GOAP) system for intelligent research workflows. Use when conducting complex research requiring multi-source synthesis, competitive analysis, technology evaluation, market research, literature reviews, fact-checking investigations, or any research task requiring systematic planning, adaptive execution, and comprehensive source triangulation. Triggers on research requests, comparative analyses, deep dives, investigation tasks, and "find everything about X" queries.
---

# GOAP Research Skill

Systematic research using Goal-Oriented Action Planning (GOAP) methodology. Combines A* search algorithms for optimal research paths with OODA-loop execution for adaptive investigation.

## Core GOAP Research Methodology

### Phase 1: State Assessment

**Define Current State (What We Know):**
- Existing knowledge about the topic
- Available sources and access constraints
- Time and depth requirements
- User's expertise level and needs

**Define Goal State (Research Objectives):**
- Specific questions to answer
- Required evidence types (primary sources, statistics, expert opinions)
- Comprehensiveness criteria
- Confidence thresholds for conclusions

**Gap Analysis:**
- Knowledge gaps to fill
- Source types needed but not yet accessed
- Contradictions to resolve
- Verification needs

### Phase 2: Action Inventory

Research actions with preconditions and effects:

| Action | Preconditions | Effects | Cost |
|--------|---------------|---------|------|
| `web_search_broad` | topic_defined | candidates_found | 1 |
| `web_search_specific` | subtopic_identified | detail_found | 1 |
| `fetch_source` | url_known | content_retrieved | 2 |
| `extract_facts` | content_retrieved | facts_cataloged | 1 |
| `verify_claim` | claim_identified | claim_verified/refuted | 3 |
| `cross_reference` | multiple_sources | consistency_checked | 2 |
| `find_primary_source` | secondary_cited | primary_located | 3 |
| `identify_experts` | domain_known | authorities_found | 2 |
| `timeline_construction` | events_found | chronology_established | 2 |
| `synthesize_findings` | facts_verified | conclusions_formed | 3 |

### Phase 3: Plan Generation (A* Pathfinding)

Generate optimal research path using:
```
f(n) = g(n) + h(n)
```
- `g(n)`: Actual cost (searches performed, time spent)
- `h(n)`: Heuristic distance to goal (remaining questions, unverified claims)

**Planning Heuristics:**
1. Prioritize authoritative sources (lower h-cost to verified state)
2. Prefer primary over secondary sources
3. Weight recent sources higher for dynamic topics
4. Factor source diversity (multiple independent confirmations)

### Phase 4: OODA Loop Execution

**Observe:**
- Monitor search results quality
- Track source reliability indicators
- Note emerging patterns and contradictions
- Identify information gaps

**Orient:**
- Assess if current path leads to goal
- Evaluate source credibility
- Update understanding based on new information
- Recognize when initial assumptions were wrong

**Decide:**
- Continue current research branch or pivot
- Pursue promising tangents or stay focused
- Determine when sufficient evidence gathered
- Choose between depth and breadth

**Act:**
- Execute next optimal action
- Document findings systematically
- Update research state
- Trigger replanning if deviation detected

### Phase 5: Dynamic Replanning

Trigger replanning when:
- Key assumption invalidated
- Higher-quality source discovered
- Research question refined
- Contradiction requiring resolution found
- Dead end reached

Replanning process:
1. Update current state with new knowledge
2. Reassess goal state (may have evolved)
3. Recalculate optimal path from new position
4. Continue execution from updated plan

## Research Execution Patterns

### Pattern A: Exploratory Research
```
Goal: comprehensive_understanding
Actions:
1. web_search_broad → identify key subtopics
2. FOR EACH subtopic: web_search_specific → gather details
3. fetch_source (top 3-5 per subtopic) → deep content
4. extract_facts → catalog information
5. cross_reference → verify consistency
6. synthesize_findings → form conclusions
```

### Pattern B: Fact Verification
```
Goal: claim_verified
Actions:
1. identify claim → clarify exact assertion
2. find_primary_source → locate original
3. verify_claim → check against primary
4. cross_reference → find independent confirmation
5. assess_confidence → rate certainty level
```

### Pattern C: Competitive Analysis
```
Goal: competitive_landscape_mapped
Actions:
1. identify_players → list all competitors
2. FOR EACH player:
   - web_search_specific → company information
   - extract_facts → key metrics, features, positioning
3. cross_reference → validate claims
4. synthesize_findings → comparative analysis
```

### Pattern D: Technology Evaluation
```
Goal: technology_assessed
Actions:
1. web_search_broad → technology landscape
2. identify_experts → find authoritative sources
3. fetch_source → documentation, benchmarks, reviews
4. extract_facts → capabilities, limitations, use cases
5. cross_reference → verify performance claims
6. synthesize_findings → recommendation with evidence
```

## Source Evaluation Framework

**Reliability Scoring (1-5):**
- 5: Primary source, peer-reviewed, official documentation
- 4: Authoritative secondary (major publications, known experts)
- 3: Reputable general sources (established news, industry reports)
- 2: Community sources (forums, blogs with demonstrated expertise)
- 1: Unverified sources (social media, anonymous claims)

**Require for conclusions:**
- Minimum 2 independent sources at reliability ≥3
- At least 1 source at reliability ≥4 for factual claims
- Primary source for direct quotes or statistics

## Output Structure

### Research Report Format

```markdown
## Executive Summary
[Key findings in 2-3 sentences]

## Research Objective
[Original question/goal]

## Methodology
[GOAP plan executed, sources consulted]

## Findings
### [Subtopic 1]
[Findings with inline citations]

### [Subtopic 2]
[Findings with inline citations]

## Confidence Assessment
- High confidence: [claims with strong evidence]
- Medium confidence: [claims with partial evidence]
- Low confidence/Uncertain: [areas needing more research]

## Sources
[Numbered list with URLs and reliability ratings]

## Research Path Log
[Actions taken, replanning decisions, dead ends]
```

## Quality Standards

**Completeness Checks:**
- [ ] All original questions addressed
- [ ] Multiple independent sources per key claim
- [ ] Primary sources found where possible
- [ ] Contradictions identified and addressed
- [ ] Confidence levels assigned to conclusions

**Bias Mitigation:**
- Seek sources with diverse perspectives
- Note funding sources and potential conflicts
- Present strongest opposing arguments
- Distinguish facts from opinions

## Advanced Techniques

### Triangulation Strategy
Verify important claims through three independent paths:
1. Primary/official sources
2. Expert commentary
3. Empirical evidence or data

### Information Decay Assessment
For dynamic topics, weight sources by recency:
- Last 24h: Full weight
- Last week: 0.8 weight
- Last month: 0.6 weight
- Older: 0.4 weight (unless historical/foundational)

### Dead-End Recovery
When research path fails:
1. Broaden search terms
2. Try alternative phrasings
3. Search in different languages (if applicable)
4. Look for adjacent topics
5. Consult meta-sources (bibliographies, "see also" sections)

## References

For detailed action implementations, see:
- [references/research-actions.md](references/research-actions.md) - Complete action specifications
- [references/source-evaluation.md](references/source-evaluation.md) - Source credibility criteria
