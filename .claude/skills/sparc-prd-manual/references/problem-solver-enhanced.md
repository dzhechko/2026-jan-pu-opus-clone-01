# Problem Solver Enhanced Reference

9-модульный framework для анализа проблем с интеграцией TRIZ.

## Overview

Problem-solver-enhanced объединяет классические методологии стратегического анализа с изобретательскими принципами TRIZ для разрешения противоречий, которые кажутся неразрешимыми.

## When to Use

- Перед началом проектирования (между Research и Specification)
- При наличии конфликтующих требований
- Когда есть несколько стейкхолдеров с разными интересами
- При необходимости обосновать архитектурные решения

## 9-Module Framework

### Module 1: First Principles Breakdown

**Цель:** Разложить проблему до фундаментальных истин.

**Процесс:**
1. Записать проблему как утверждение
2. Спросить "Что мы знаем точно?" (не предположения)
3. Перечислить базовые истины (физика, математика, проверенные факты)
4. Вывести следствия из базовых истин

**Template:**
```
Problem: [Проблема]

Fundamental Truths:
1. [Истина 1 - проверяемый факт]
2. [Истина 2]
3. [Истина 3]

Derived Implications:
- From (1): [Следствие]
- From (1+2): [Следствие]

What we CANNOT change:
- [Constraint from truth]

What we CAN change:
- [Design space]
```

### Module 2: Root Cause Analysis (5 Whys)

**Цель:** Найти первопричину, а не симптом.

**Процесс:**
1. Сформулировать проблему
2. Спросить "Почему?" 5 раз (минимум)
3. Каждый ответ должен быть конкретным
4. Остановиться когда достигнута системная причина

**Template:**
```
Problem: [Описание проблемы]
    ↓ Why?
Level 1: [Непосредственная причина]
    ↓ Why?
Level 2: [Причина причины]
    ↓ Why?
Level 3: [Deeper cause]
    ↓ Why?
Level 4: [Systemic cause]
    ↓ Why?
Level 5: [ROOT CAUSE]

Validation: Если устранить ROOT CAUSE, исчезнут ли Level 1-4?
```

### Module 3: SCQA Framework

**Цель:** Структурировать коммуникацию проблемы и решения.

**Компоненты:**
- **S**ituation: Стабильное состояние (как было раньше)
- **C**omplication: Что изменилось (почему статус-кво не работает)
- **Q**uestion: Ключевой вопрос (что нужно решить)
- **A**nswer: Предлагаемое решение

**Template:**
```
SITUATION:
[Описание стабильного состояния / контекста]

COMPLICATION:
[Что изменилось / новые ограничения / возникшие проблемы]

QUESTION:
[Один чёткий вопрос, на который нужно ответить]

ANSWER:
[Конкретное предложение по решению]
```

### Module 4: Game Theory Analysis

**Цель:** Понять интересы всех участников и найти устойчивое решение.

**Процесс:**
1. Идентифицировать всех стейкхолдеров
2. Определить их цели и ограничения
3. Оценить их power и interest
4. Найти Nash Equilibrium (устойчивое состояние)
5. Определить Pareto optimal (нет улучшения без ухудшения для других)

**Template:**
```
STAKEHOLDER MATRIX:

| Actor | Goals | Constraints | Power | Interest | Strategy |
|-------|-------|-------------|-------|----------|----------|
| [A1]  |       |             | H/M/L | H/M/L    |          |
| [A2]  |       |             |       |          |          |

INTERACTIONS:
- [A1] vs [A2]: [Competitive / Cooperative / Mixed]
- Potential conflicts: [...]
- Alignment opportunities: [...]

EQUILIBRIUM ANALYSIS:
- Nash Equilibrium: [Состояние где никто не хочет менять стратегию]
- Pareto Frontier: [Набор решений где нельзя улучшить одному без ухудшения другому]
- Recommended position: [Где мы хотим быть]
```

### Module 5: Second-Order Thinking

**Цель:** Предвидеть последствия последствий.

**Процесс:**
1. Определить первичное действие/решение
2. Перечислить непосредственные последствия (1st order)
3. Для каждого последствия — его последствия (2nd order)
4. Продолжить до 3rd order
5. Выявить feedback loops

**Template:**
```
ACTION: [Решение/действие]

FIRST ORDER (immediate):
├─ [Consequence 1.1]
├─ [Consequence 1.2]
└─ [Consequence 1.3]

SECOND ORDER (6-12 months):
├─ From 1.1 → [Consequence 2.1]
├─ From 1.2 → [Consequence 2.2]
└─ From 1.3 → [Consequence 2.3]

THIRD ORDER (12-24 months):
├─ From 2.1 → [Consequence 3.1]
└─ From 2.2 → [Consequence 3.2]

FEEDBACK LOOPS:
- [3.x] → reinforces → [1.y] (positive/negative loop)

SURPRISES TO WATCH:
- [Non-obvious consequence that might surprise]
```

### Module 6: Contradiction Analysis (TRIZ)

**Цель:** Найти и разрешить противоречия без компромисса.

**Типы противоречий:**
- **Technical:** Улучшение А ухудшает Б
- **Physical:** Объект должен быть одновременно X и не-X
- **Administrative:** Знаем решение, но не можем реализовать

**40 Inventive Principles (ключевые):**

| # | Principle | Application |
|---|-----------|-------------|
| 1 | Segmentation | Разделить на части |
| 2 | Taking Out | Извлечь мешающую часть |
| 10 | Preliminary Action | Сделать заранее |
| 13 | The Other Way Round | Инверсия |
| 15 | Dynamics | Сделать адаптивным |
| 17 | Another Dimension | Перейти в другое измерение |
| 25 | Self-Service | Система обслуживает себя |
| 35 | Parameter Changes | Изменить параметр |
| 40 | Composite Materials | Использовать композиты |

**Template:**
```
CONTRADICTION IDENTIFIED:

Technical Contradiction:
- Improving [Parameter A] degrades [Parameter B]
- Example: ↑ Security → ↓ Usability

TRIZ Analysis:
- Parameter to improve: [39 parameters list]
- Parameter degraded: [39 parameters list]
- Contradiction matrix suggests: [Principles]

Applied Principle: [#X - Name]
Resolution: [How principle resolves contradiction]

Physical Contradiction (if applicable):
- Object must be [X] to achieve [Goal 1]
- Object must be [NOT X] to achieve [Goal 2]

Separation Strategy:
- [ ] Separation in time
- [ ] Separation in space
- [ ] Separation on condition
- [ ] Separation in structure

Resolution: [How contradiction is resolved]
```

### Module 7: Design Thinking

**Цель:** Переосмыслить проблему через эмпатию к пользователю.

**Этапы:**
1. **Empathize:** Понять пользователя глубже чем он сам
2. **Define:** Переформулировать проблему
3. **Ideate:** Генерация идей без критики
4. **Prototype:** Быстрый прототип для проверки
5. **Test:** Валидация с реальными пользователями

**Template:**
```
EMPATHY MAP:

         THINKS
    [Internal thoughts]
           │
HEARS ────┼──── SEES
[What they│    [Environment]
hear from │
others]   │
           │
         SAYS & DOES
      [Observable behavior]
           │
         FEELS
    [Emotions, fears]

PAIN POINTS:
1. [Frustration 1]
2. [Frustration 2]

GAINS WANTED:
1. [Desired outcome 1]
2. [Desired outcome 2]

REFRAMED PROBLEM:
"How might we [verb] for [user] so that [outcome]?"
```

### Module 8: OODA Loop

**Цель:** Быстрая адаптация к меняющейся ситуации.

**Компоненты:**
- **O**bserve: Сбор информации из внешней среды
- **O**rient: Интерпретация в контексте (культура, опыт, анализ)
- **D**ecide: Выбор действия
- **A**ct: Выполнение и возврат к Observe

**Template:**
```
OBSERVE:
- Market signals: [...]
- User feedback: [...]
- Competitor moves: [...]
- Technology trends: [...]

ORIENT:
- Our position: [...]
- Our advantages: [...]
- Our gaps: [...]
- Mental models to challenge: [...]

DECIDE:
- Options considered:
  1. [Option A] — Pro: [...] Con: [...]
  2. [Option B] — Pro: [...] Con: [...]
- Decision: [Selected option]
- Rationale: [Why this one]

ACT:
- Immediate actions: [...]
- Success indicators: [...]
- Feedback loop: [How we'll know to re-observe]
```

### Module 9: Solution Synthesis

**Цель:** Интегрировать insights из всех модулей в coherent strategy.

**Процесс:**
1. Собрать ключевые insights из модулей 1-8
2. Выявить паттерны и связи
3. Сформулировать стратегическое направление
4. Определить trade-offs и их обоснование
5. Установить success criteria

**Template:**
```
SYNTHESIS SUMMARY

From First Principles:
- Key constraint: [...]
- Design space: [...]

From Root Cause:
- Root cause to address: [...]

From SCQA:
- Core question: [...]

From Game Theory:
- Key stakeholder alignment: [...]

From Second-Order:
- Watch out for: [...]

From TRIZ:
- Contradiction resolved via: [...]

From Design Thinking:
- Reframed as: [...]

From OODA:
- Decision: [...]

═══════════════════════════════════

STRATEGIC DIRECTION:
[One paragraph synthesizing all insights]

KEY DECISIONS:
1. [Decision 1] — justified by [modules]
2. [Decision 2] — justified by [modules]

ACCEPTED TRADE-OFFS:
1. [Chose A over B] because [rationale from analysis]

SUCCESS CRITERIA:
- [ ] [Measurable outcome 1]
- [ ] [Measurable outcome 2]
```

## Integration with SPARC

Problem-solver-enhanced fits into SPARC workflow as Phase 2 (SOLVE):

```
Research → SOLVE → Specification → Pseudocode → Architecture → Refinement → Completion
              ↑
    9-module framework + TRIZ
```

**Why before Specification:**
- Ensures requirements are based on deep analysis
- Contradictions resolved before they become technical debt
- Stakeholder alignment achieved before commitment
- Trade-offs documented and justified

**Outputs feed into:**
- **Specification:** Requirements derived from Solution Strategy
- **Architecture:** Constraints and design space from First Principles
- **Refinement:** Edge cases from Second-Order Thinking
