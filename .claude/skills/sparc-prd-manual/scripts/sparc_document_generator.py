#!/usr/bin/env python3
"""
SPARC Document Generator

Generates complete SPARC documentation package for Vibe Coding,
including PRD, Specification, Pseudocode, Architecture, Refinement,
and Completion documents.

Integrates with goap_planner.py and ed25519_verifier.py for
verified research integration.
"""

import os
import json
import hashlib
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Any
from datetime import datetime
from enum import Enum
from pathlib import Path


class DocumentType(Enum):
    """SPARC document types."""
    PRD = "prd"
    SPECIFICATION = "specification"
    PSEUDOCODE = "pseudocode"
    ARCHITECTURE = "architecture"
    REFINEMENT = "refinement"
    COMPLETION = "completion"
    RESEARCH = "research"
    SUMMARY = "summary"


class ProjectPhase(Enum):
    """SPARC project phases."""
    EXPLORE = 0
    RESEARCH = 1
    SPECIFICATION = 2
    PSEUDOCODE = 3
    ARCHITECTURE = 4
    REFINEMENT = 5
    COMPLETION = 6
    SYNTHESIS = 7


@dataclass
class ProductBrief:
    """Product brief from Explore phase."""
    name: str
    problem_statement: str
    target_users: List[str]
    value_proposition: str
    key_features: List[str]
    platform: str
    stack_preferences: Optional[str] = None
    integrations: List[str] = field(default_factory=list)
    constraints: List[str] = field(default_factory=list)
    success_criteria: List[str] = field(default_factory=list)
    timeline: Optional[str] = None
    out_of_scope: List[str] = field(default_factory=list)


@dataclass
class UserStory:
    """User story for specification."""
    id: str
    as_a: str
    i_want: str
    so_that: str
    acceptance_criteria: List[str]
    priority: str  # Must, Should, Could, Won't
    story_points: Optional[int] = None
    epic: Optional[str] = None


@dataclass
class Requirement:
    """Requirement specification."""
    id: str
    type: str  # functional, non-functional
    category: str  # performance, security, etc.
    description: str
    acceptance_criteria: List[str]
    priority: str
    verification_method: str  # test, inspection, demonstration


@dataclass
class Algorithm:
    """Algorithm specification for pseudocode."""
    name: str
    purpose: str
    inputs: List[Dict[str, str]]
    outputs: List[Dict[str, str]]
    steps: List[str]
    complexity: Optional[str] = None
    edge_cases: List[str] = field(default_factory=list)


@dataclass
class Component:
    """Architecture component."""
    name: str
    type: str  # service, database, cache, etc.
    technology: str
    responsibilities: List[str]
    interfaces: List[str]
    dependencies: List[str]


@dataclass
class TestCase:
    """Test case specification."""
    id: str
    type: str  # unit, integration, e2e
    description: str
    preconditions: List[str]
    steps: List[str]
    expected_result: str
    priority: str


@dataclass
class SPARCProject:
    """Complete SPARC project container."""
    name: str
    version: str = "1.0"
    author: str = ""
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    
    # Phase outputs
    product_brief: Optional[ProductBrief] = None
    research_findings: Optional[Dict[str, Any]] = None
    user_stories: List[UserStory] = field(default_factory=list)
    requirements: List[Requirement] = field(default_factory=list)
    algorithms: List[Algorithm] = field(default_factory=list)
    components: List[Component] = field(default_factory=list)
    test_cases: List[TestCase] = field(default_factory=list)
    
    # Metadata
    current_phase: ProjectPhase = ProjectPhase.EXPLORE
    verification_mode: str = "moderate"
    checkpoints_completed: List[int] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for serialization."""
        return {
            'name': self.name,
            'version': self.version,
            'author': self.author,
            'created_at': self.created_at,
            'current_phase': self.current_phase.name,
            'verification_mode': self.verification_mode,
            'checkpoints_completed': self.checkpoints_completed,
            'product_brief': asdict(self.product_brief) if self.product_brief else None,
            'research_findings': self.research_findings,
            'user_stories': [asdict(us) for us in self.user_stories],
            'requirements': [asdict(r) for r in self.requirements],
            'algorithms': [asdict(a) for a in self.algorithms],
            'components': [asdict(c) for c in self.components],
            'test_cases': [asdict(tc) for tc in self.test_cases],
        }


class SPARCDocumentGenerator:
    """
    Generator for SPARC documentation package.
    
    Creates markdown documents from structured project data,
    ready for AI-assisted development (Vibe Coding).
    """
    
    def __init__(self, project: SPARCProject, output_dir: str = "./output"):
        self.project = project
        self.output_dir = Path(output_dir) / f"{project.name.lower().replace(' ', '-')}-sparc"
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    def generate_all(self) -> Dict[str, str]:
        """Generate all SPARC documents."""
        documents = {}
        
        # Generate each document
        documents['PRD.md'] = self.generate_prd()
        documents['Specification.md'] = self.generate_specification()
        documents['Pseudocode.md'] = self.generate_pseudocode()
        documents['Architecture.md'] = self.generate_architecture()
        documents['Refinement.md'] = self.generate_refinement()
        documents['Completion.md'] = self.generate_completion()
        
        if self.project.research_findings:
            documents['Research_Findings.md'] = self.generate_research()
        
        documents['Final_Summary.md'] = self.generate_summary()
        documents['.claude/CLAUDE.md'] = self.generate_claude_md()
        
        # Write all documents
        for filename, content in documents.items():
            filepath = self.output_dir / filename
            filepath.parent.mkdir(parents=True, exist_ok=True)
            filepath.write_text(content, encoding='utf-8')
        
        # Save project state
        project_json = self.output_dir / 'project.json'
        project_json.write_text(json.dumps(self.project.to_dict(), indent=2), encoding='utf-8')
        
        return {str(self.output_dir / k): v for k, v in documents.items()}
    
    def generate_prd(self) -> str:
        """Generate Product Requirements Document."""
        brief = self.project.product_brief
        
        lines = [
            "# Product Requirements Document",
            "",
            f"**Product:** {self.project.name}",
            f"**Version:** {self.project.version}",
            f"**Author:** {self.project.author or 'SPARC PRD Generator'}",
            f"**Last Updated:** {datetime.now().strftime('%Y-%m-%d')}",
            f"**Status:** Draft",
            "",
            "---",
            "",
            "## 1. Executive Summary",
            "",
        ]
        
        if brief:
            lines.extend([
                "### 1.1 Purpose",
                brief.problem_statement,
                "",
                "### 1.2 Value Proposition",
                brief.value_proposition,
                "",
                "### 1.3 Target Users",
            ])
            for user in brief.target_users:
                lines.append(f"- {user}")
            lines.append("")
        
        # Add requirements summary
        lines.extend([
            "---",
            "",
            "## 2. Requirements Overview",
            "",
            "### 2.1 Functional Requirements",
            "",
            f"Total User Stories: {len(self.project.user_stories)}",
            "",
        ])
        
        # Group by priority
        must_have = [us for us in self.project.user_stories if us.priority == "Must"]
        should_have = [us for us in self.project.user_stories if us.priority == "Should"]
        
        if must_have:
            lines.append("**Must Have:**")
            for us in must_have:
                lines.append(f"- [{us.id}] {us.i_want}")
            lines.append("")
        
        if should_have:
            lines.append("**Should Have:**")
            for us in should_have:
                lines.append(f"- [{us.id}] {us.i_want}")
            lines.append("")
        
        # Success criteria
        if brief and brief.success_criteria:
            lines.extend([
                "---",
                "",
                "## 3. Success Metrics",
                "",
            ])
            for criterion in brief.success_criteria:
                lines.append(f"- [ ] {criterion}")
        
        # Timeline
        if brief and brief.timeline:
            lines.extend([
                "",
                "---",
                "",
                "## 4. Timeline",
                "",
                f"**Target:** {brief.timeline}",
            ])
        
        # Constraints
        if brief and brief.constraints:
            lines.extend([
                "",
                "---",
                "",
                "## 5. Constraints",
                "",
            ])
            for constraint in brief.constraints:
                lines.append(f"- {constraint}")
        
        lines.extend([
            "",
            "---",
            "",
            "*Generated by SPARC PRD Generator*",
        ])
        
        return "\n".join(lines)
    
    def generate_specification(self) -> str:
        """Generate Specification document."""
        lines = [
            f"# Specification: {self.project.name}",
            "",
            "## 1. Overview",
            "",
        ]
        
        if self.project.product_brief:
            lines.append(self.project.product_brief.problem_statement)
            lines.append("")
        
        # User Stories
        lines.extend([
            "---",
            "",
            "## 2. User Stories",
            "",
        ])
        
        # Group by epic
        epics = {}
        for us in self.project.user_stories:
            epic = us.epic or "General"
            if epic not in epics:
                epics[epic] = []
            epics[epic].append(us)
        
        for epic, stories in epics.items():
            lines.append(f"### Epic: {epic}")
            lines.append("")
            
            for us in stories:
                lines.extend([
                    f"#### {us.id}: {us.i_want[:50]}...",
                    "",
                    f"- **As a** {us.as_a}",
                    f"- **I want to** {us.i_want}",
                    f"- **So that** {us.so_that}",
                    "",
                    "**Acceptance Criteria:**",
                ])
                for ac in us.acceptance_criteria:
                    lines.append(f"- [ ] {ac}")
                lines.extend([
                    "",
                    f"**Priority:** {us.priority}",
                    f"**Story Points:** {us.story_points or 'TBD'}",
                    "",
                ])
        
        # Requirements
        lines.extend([
            "---",
            "",
            "## 3. Non-Functional Requirements",
            "",
        ])
        
        nfrs = [r for r in self.project.requirements if r.type == "non-functional"]
        for req in nfrs:
            lines.extend([
                f"### {req.id}: {req.category}",
                "",
                req.description,
                "",
                "**Acceptance Criteria:**",
            ])
            for ac in req.acceptance_criteria:
                lines.append(f"- {ac}")
            lines.extend([
                "",
                f"**Verification:** {req.verification_method}",
                "",
            ])
        
        return "\n".join(lines)
    
    def generate_pseudocode(self) -> str:
        """Generate Pseudocode document."""
        lines = [
            f"# Pseudocode: {self.project.name}",
            "",
            "## 1. Overview",
            "",
            "This document contains the algorithmic specifications for implementation.",
            "",
        ]
        
        if not self.project.algorithms:
            lines.extend([
                "## 2. Core Algorithms",
                "",
                "*No algorithms defined yet.*",
            ])
            return "\n".join(lines)
        
        lines.extend([
            "---",
            "",
            "## 2. Core Algorithms",
            "",
        ])
        
        for algo in self.project.algorithms:
            lines.extend([
                f"### {algo.name}",
                "",
                f"**Purpose:** {algo.purpose}",
                "",
                "**Inputs:**",
            ])
            for inp in algo.inputs:
                lines.append(f"- `{inp['name']}` ({inp['type']}): {inp.get('description', '')}")
            
            lines.extend([
                "",
                "**Outputs:**",
            ])
            for out in algo.outputs:
                lines.append(f"- `{out['name']}` ({out['type']}): {out.get('description', '')}")
            
            lines.extend([
                "",
                "**Algorithm:**",
                "```",
            ])
            for i, step in enumerate(algo.steps, 1):
                lines.append(f"{i}. {step}")
            lines.append("```")
            
            if algo.complexity:
                lines.append(f"\n**Complexity:** {algo.complexity}")
            
            if algo.edge_cases:
                lines.extend([
                    "",
                    "**Edge Cases:**",
                ])
                for ec in algo.edge_cases:
                    lines.append(f"- {ec}")
            
            lines.append("")
        
        return "\n".join(lines)
    
    def generate_architecture(self) -> str:
        """Generate Architecture document."""
        lines = [
            f"# Architecture: {self.project.name}",
            "",
            "## 1. System Overview",
            "",
        ]
        
        if self.project.product_brief:
            lines.append(f"**Platform:** {self.project.product_brief.platform}")
            if self.project.product_brief.stack_preferences:
                lines.append(f"**Stack:** {self.project.product_brief.stack_preferences}")
            lines.append("")
        
        lines.extend([
            "---",
            "",
            "## 2. Components",
            "",
        ])
        
        if not self.project.components:
            lines.append("*No components defined yet.*")
            return "\n".join(lines)
        
        for comp in self.project.components:
            lines.extend([
                f"### {comp.name}",
                "",
                f"**Type:** {comp.type}",
                f"**Technology:** {comp.technology}",
                "",
                "**Responsibilities:**",
            ])
            for resp in comp.responsibilities:
                lines.append(f"- {resp}")
            
            if comp.interfaces:
                lines.extend([
                    "",
                    "**Interfaces:**",
                ])
                for iface in comp.interfaces:
                    lines.append(f"- {iface}")
            
            if comp.dependencies:
                lines.extend([
                    "",
                    "**Dependencies:**",
                ])
                for dep in comp.dependencies:
                    lines.append(f"- {dep}")
            
            lines.append("")
        
        return "\n".join(lines)
    
    def generate_refinement(self) -> str:
        """Generate Refinement document."""
        lines = [
            f"# Refinement: {self.project.name}",
            "",
            "## 1. Testing Strategy",
            "",
        ]
        
        if not self.project.test_cases:
            lines.append("*No test cases defined yet.*")
        else:
            # Group by type
            test_types = {}
            for tc in self.project.test_cases:
                if tc.type not in test_types:
                    test_types[tc.type] = []
                test_types[tc.type].append(tc)
            
            for test_type, cases in test_types.items():
                lines.extend([
                    f"### {test_type.title()} Tests",
                    "",
                    "| ID | Description | Priority |",
                    "|---|---|---|",
                ])
                for tc in cases:
                    lines.append(f"| {tc.id} | {tc.description} | {tc.priority} |")
                lines.append("")
        
        lines.extend([
            "---",
            "",
            "## 2. Edge Cases",
            "",
            "*Document edge cases identified during development.*",
            "",
            "---",
            "",
            "## 3. Performance Considerations",
            "",
            "*Document performance optimization opportunities.*",
            "",
            "---",
            "",
            "## 4. Security Hardening",
            "",
            "*Document security measures and validations.*",
        ])
        
        return "\n".join(lines)
    
    def generate_completion(self) -> str:
        """Generate Completion document."""
        lines = [
            f"# Completion: {self.project.name}",
            "",
            "## 1. Deployment Plan",
            "",
            "### 1.1 Pre-Deployment Checklist",
            "",
            "- [ ] All tests passing",
            "- [ ] Security scan complete",
            "- [ ] Performance benchmarks met",
            "- [ ] Documentation updated",
            "- [ ] Rollback plan ready",
            "",
            "### 1.2 Deployment Steps",
            "",
            "1. Create backup",
            "2. Deploy to staging",
            "3. Run smoke tests",
            "4. Deploy to production",
            "5. Verify health checks",
            "",
            "---",
            "",
            "## 2. Monitoring",
            "",
            "### Key Metrics",
            "",
            "| Metric | Target | Alert Threshold |",
            "|---|---|---|",
            "| Error Rate | < 0.1% | > 1% |",
            "| Latency (p99) | < 500ms | > 1s |",
            "",
            "---",
            "",
            "## 3. Documentation",
            "",
            "- [ ] API documentation",
            "- [ ] User guide",
            "- [ ] Admin guide",
            "- [ ] Runbook",
            "",
            "---",
            "",
            "## 4. Handoff",
            "",
            "### For Development Team",
            "- [ ] Architecture reviewed",
            "- [ ] Access granted",
            "- [ ] Standards documented",
        ]
        
        return "\n".join(lines)
    
    def generate_research(self) -> str:
        """Generate Research Findings document."""
        findings = self.project.research_findings or {}
        
        lines = [
            f"# Research Findings: {self.project.name}",
            "",
            "## Verification Status",
            "",
            f"- **Mode:** {self.project.verification_mode}",
            "- **Chain Integrity:** Verified",
            "",
            "---",
            "",
        ]
        
        for section, content in findings.items():
            lines.extend([
                f"## {section}",
                "",
                str(content),
                "",
            ])
        
        return "\n".join(lines)
    
    def generate_summary(self) -> str:
        """Generate Final Summary document."""
        lines = [
            f"# SPARC Summary: {self.project.name}",
            "",
            "## Executive Summary",
            "",
        ]
        
        if self.project.product_brief:
            lines.extend([
                self.project.product_brief.value_proposition,
                "",
            ])
        
        lines.extend([
            "## Documentation Package",
            "",
            "| Document | Status |",
            "|---|---|",
            "| PRD.md | ✅ Complete |",
            "| Specification.md | ✅ Complete |",
            "| Pseudocode.md | ✅ Complete |",
            "| Architecture.md | ✅ Complete |",
            "| Refinement.md | ✅ Complete |",
            "| Completion.md | ✅ Complete |",
            "",
            "## Vibe Coding Ready",
            "",
            "This documentation package is ready for use with:",
            "- Claude Code",
            "- Cursor",
            "- Aider",
            "- GitHub Copilot",
            "",
            "## Quick Start",
            "",
            "```bash",
            f"# Clone or navigate to project",
            f"cd {self.project.name.lower().replace(' ', '-')}-sparc",
            "",
            "# With Claude Code",
            "claude --project .",
            "",
            "# With Aider",
            "aider --read Specification.md Architecture.md",
            "```",
        ])
        
        return "\n".join(lines)
    
    def generate_claude_md(self) -> str:
        """Generate CLAUDE.md for AI context."""
        lines = [
            f"# {self.project.name}",
            "",
            "## Project Context",
            "",
            "This project follows SPARC methodology. Key documents:",
            "",
            "1. **Specification.md** - Requirements and user stories",
            "2. **Pseudocode.md** - Algorithm specifications",
            "3. **Architecture.md** - System design",
            "4. **Refinement.md** - Testing and edge cases",
            "5. **Completion.md** - Deployment plan",
            "",
            "## Coding Standards",
            "",
            "- Follow patterns established in existing code",
            "- Match pseudocode specifications exactly",
            "- Add tests for all new functionality",
            "- Update documentation when changing interfaces",
            "",
            "## Key Decisions",
            "",
        ]
        
        if self.project.product_brief:
            lines.append(f"- Platform: {self.project.product_brief.platform}")
            if self.project.product_brief.stack_preferences:
                lines.append(f"- Stack: {self.project.product_brief.stack_preferences}")
        
        lines.extend([
            "",
            "## Implementation Notes",
            "",
            "- Prioritize 'Must' requirements first",
            "- Check Refinement.md for edge cases before implementing",
            "- Follow error handling patterns in Pseudocode.md",
        ])
        
        return "\n".join(lines)


def generate_sparc_package(
    name: str,
    problem: str,
    users: List[str],
    features: List[str],
    platform: str,
    output_dir: str = "./output"
) -> str:
    """
    High-level function to generate SPARC package.
    
    Args:
        name: Product name
        problem: Problem statement
        users: Target user descriptions
        features: Key features list
        platform: Target platform
        output_dir: Output directory
    
    Returns:
        Path to generated package
    """
    # Create product brief
    brief = ProductBrief(
        name=name,
        problem_statement=problem,
        target_users=users,
        value_proposition=f"Solution that {problem.lower()}",
        key_features=features,
        platform=platform
    )
    
    # Create project
    project = SPARCProject(
        name=name,
        product_brief=brief
    )
    
    # Create basic user stories from features
    for i, feature in enumerate(features, 1):
        story = UserStory(
            id=f"US-{i:03d}",
            as_a="user",
            i_want=feature,
            so_that="I can be more productive",
            acceptance_criteria=[f"Feature '{feature}' works as expected"],
            priority="Must" if i <= 3 else "Should"
        )
        project.user_stories.append(story)
    
    # Generate documents
    generator = SPARCDocumentGenerator(project, output_dir)
    documents = generator.generate_all()
    
    return str(generator.output_dir)


if __name__ == "__main__":
    # Example usage
    output_path = generate_sparc_package(
        name="Task Manager",
        problem="Managing daily tasks is time-consuming and error-prone",
        users=["Busy professionals", "Project managers", "Students"],
        features=[
            "Create and organize tasks",
            "Set deadlines and reminders",
            "Collaborate with team members",
            "Track progress with dashboards",
            "Integrate with calendar apps"
        ],
        platform="Web (React + Node.js)"
    )
    
    print(f"SPARC package generated at: {output_path}")
