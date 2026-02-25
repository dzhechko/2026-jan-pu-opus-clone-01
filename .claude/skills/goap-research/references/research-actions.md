# Research Actions Reference

Complete specifications for GOAP research actions.

## Search Actions

### web_search_broad
**Purpose:** Initial exploration to identify landscape and key subtopics
**Preconditions:** `topic_defined`
**Effects:** `candidates_found`, `subtopics_identified`
**Cost:** 1
**Implementation:**
```
Query strategy:
1. Start with core topic terms
2. Add qualifiers: "overview", "guide", "comprehensive"
3. Note recurring subtopics in results
4. Identify authoritative domains appearing frequently
```
**Success criteria:** ≥5 relevant results, ≥3 subtopics identified

### web_search_specific
**Purpose:** Targeted search for specific information
**Preconditions:** `subtopic_identified` OR `specific_question_formed`
**Effects:** `detail_found`, `sources_identified`
**Cost:** 1
**Implementation:**
```
Query strategy:
1. Use exact phrases for specific claims
2. Include domain qualifiers ("site:gov", "site:edu")
3. Add date constraints for temporal queries
4. Use boolean operators for precision
```
**Success criteria:** Direct answers or clear source paths found

### web_search_expert
**Purpose:** Find authoritative voices and expert sources
**Preconditions:** `domain_known`
**Effects:** `authorities_found`, `expert_opinions_available`
**Cost:** 2
**Implementation:**
```
Query patterns:
- "[topic] expert interview"
- "[topic] researcher [institution]"
- "[topic] author [book/paper]"
- "[domain] professor"
```
**Success criteria:** ≥2 credentialed experts identified

## Content Retrieval Actions

### fetch_source
**Purpose:** Retrieve full content from identified URL
**Preconditions:** `url_known`, `source_accessible`
**Effects:** `content_retrieved`, `full_context_available`
**Cost:** 2
**Implementation:**
- Use web_fetch tool with appropriate URL
- Handle paywalls by noting limitation
- Extract key sections if full content unavailable
- Note retrieval timestamp

### extract_facts
**Purpose:** Systematically extract verifiable claims
**Preconditions:** `content_retrieved`
**Effects:** `facts_cataloged`, `claims_identified`
**Cost:** 1
**Implementation:**
```
Extraction protocol:
1. Identify all factual claims (dates, numbers, names, events)
2. Note source attribution for each fact
3. Flag claims needing verification
4. Record exact quotes with page/section reference
5. Distinguish facts from opinions/interpretations
```

## Verification Actions

### verify_claim
**Purpose:** Confirm or refute specific assertion
**Preconditions:** `claim_identified`, `verification_source_available`
**Effects:** `claim_verified` OR `claim_refuted` OR `claim_uncertain`
**Cost:** 3
**Implementation:**
```
Verification protocol:
1. Locate original/primary source
2. Cross-check with ≥2 independent sources
3. Check for retractions/corrections
4. Verify quoted individuals confirm quotes
5. For statistics: verify methodology, sample, timeframe
```
**Output:** Confidence rating (verified/likely/uncertain/unlikely/refuted)

### cross_reference
**Purpose:** Check consistency across multiple sources
**Preconditions:** `multiple_sources` (≥3)
**Effects:** `consistency_checked`, `contradictions_identified`
**Cost:** 2
**Implementation:**
```
Cross-reference matrix:
1. List key claims from each source
2. Mark agreement/disagreement for each claim
3. Note source reliability weighting
4. Identify majority consensus
5. Flag significant contradictions for resolution
```

### find_primary_source
**Purpose:** Trace claim to original source
**Preconditions:** `secondary_source_cites_claim`
**Effects:** `primary_located` OR `primary_unavailable`
**Cost:** 3
**Implementation:**
```
Tracing protocol:
1. Check footnotes/bibliography of secondary source
2. Search for original publication
3. For statistics: find original study/dataset
4. For quotes: find original interview/speech
5. For events: find contemporaneous reporting
```

## Analysis Actions

### identify_patterns
**Purpose:** Discover recurring themes and connections
**Preconditions:** `facts_cataloged` (≥10 facts)
**Effects:** `patterns_identified`, `themes_emerged`
**Cost:** 2
**Implementation:**
- Group related facts
- Identify temporal patterns
- Note causal relationships
- Map entity connections

### timeline_construction
**Purpose:** Establish chronological sequence
**Preconditions:** `events_found` (≥3 dated events)
**Effects:** `chronology_established`, `sequence_clear`
**Cost:** 2
**Implementation:**
- Order events by date
- Identify causation vs correlation
- Note gaps in timeline
- Mark uncertain dates

### compare_perspectives
**Purpose:** Document different viewpoints
**Preconditions:** `multiple_perspectives_found`
**Effects:** `viewpoints_mapped`, `disagreements_clarified`
**Cost:** 2
**Implementation:**
- Identify distinct positions
- Note supporting evidence for each
- Identify source biases
- Map areas of consensus vs disagreement

## Synthesis Actions

### synthesize_findings
**Purpose:** Integrate research into coherent conclusions
**Preconditions:** `facts_verified` (sufficient coverage), `patterns_identified`
**Effects:** `conclusions_formed`, `confidence_assigned`
**Cost:** 3
**Implementation:**
```
Synthesis protocol:
1. Review all verified facts
2. Weight by source reliability
3. Address contradictions
4. Form conclusions supported by evidence
5. Assign confidence levels
6. Note remaining uncertainties
```

### generate_report
**Purpose:** Produce structured research output
**Preconditions:** `conclusions_formed`
**Effects:** `report_delivered`
**Cost:** 2
**Implementation:**
- Follow standard report structure
- Include methodology section
- Cite all sources
- Present confidence assessments
- Document research path

## Recovery Actions

### expand_search
**Purpose:** Broaden search when stuck
**Preconditions:** `dead_end_reached`
**Effects:** `new_candidates_found` OR `topic_exhausted`
**Cost:** 1
**Implementation:**
- Use synonym expansion
- Try related topics
- Search in different languages
- Check academic databases
- Explore adjacent domains

### pivot_approach
**Purpose:** Change research strategy
**Preconditions:** `current_approach_ineffective`
**Effects:** `new_approach_active`
**Cost:** 1
**Implementation:**
- Document why current approach failed
- Identify alternative information paths
- Update research plan
- Resume with new strategy
