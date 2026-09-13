# Research Workflow

## Purpose

This repository supports my robotics and AI paper study workflow.

Main research areas:
- Reinforcement Learning (RL)
- Vision-Language-Action (VLA)
- Vision-Language Models (VLM)
- Computer Vision (CV)
- Attention / Transformer

The goal of automation is to reduce repetitive work around paper discovery, file organization, metadata entry, context retrieval, and note organization.

The automation should **not** replace the interactive learning process itself.

---

## System Roles

### GitHub
GitHub stores:
- paper PDFs and source files
- paper-related implementations
- original experiments
- workflow instructions

GitHub is the research workspace, not the final study notebook.

### Notion
My study notes are stored in:

`Robotics → 로보틱스 논문 → Papers`

Existing database properties:
- Title
- Authors
- Done
- Year
- Tag
- Keys
- URL/PDF

Existing Tags:
- RL
- VLA
- VLM
- CV
- Attention

Do not change this database schema unless I explicitly request it.

Notion stores knowledge that I actually want to preserve after studying.
Do not unnecessarily duplicate the same study notes in GitHub.

### ChatGPT
ChatGPT acts as the research hub for:
- discovering papers
- retrieving paper files
- reading relevant paper context
- retrieving existing Notion notes
- answering questions naturally during study
- organizing useful learned content when requested
- updating paper metadata and study status when requested

Do not impose a fixed answer template on normal study questions.
The conversation should remain flexible and natural.

### Codex
Codex is mainly used for:
- paper implementation
- code analysis
- reproduction
- experiments
- repository automation

---

## Paper Discovery Workflow

When I ask to find papers:

1. Search for relevant papers.
2. Present useful candidates with enough information to choose among them.
3. After I choose a paper, collect metadata when possible:
   - Title
   - Authors
   - Year
   - URL / PDF source
   - Research category / Tag
4. Check my existing Notion Papers database before assigning a new sequence number.
5. Use the existing naming convention consistently.

Examples:
- `RL_2. Playing Atari with Deep Reinforcement Learning`
- `VLA_4. OpenVLA: An Open-Source Vision-Language-Action Model`
- `Attention_2. BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding`

For GitHub filenames, use a filesystem-friendly form such as:
- `RL_02_DQN.pdf`
- `VLA_04_OpenVLA.pdf`
- `Attention_02_BERT.pdf`

---

## Paper Storage

Store paper files under the matching category:

```text
papers/
├── RL/
├── VLA/
├── VLM/
├── CV/
└── Attention/
```

Use the Notion `Tag` taxonomy as the primary category system unless I explicitly change it later.

Do not create duplicate copies of the same paper unnecessarily.

---

## Study Workflow

When I say that I want to study or continue studying a paper:

1. Identify the target paper.
2. Locate its GitHub file if available.
3. Locate its existing Notion Papers entry and current notes if available.
4. Use the paper and existing notes as context.
5. Then continue the conversation naturally.

I will read papers myself and ask questions freely.
Do not force a predefined Q&A format.
Do not automatically summarize the entire paper unless I ask for it.

The learning process should remain:

`Read → Ask → Understand → Ask follow-up questions → Save useful knowledge`

---

## Notion Note Workflow

Do not automatically write every conversation to Notion.

When I explicitly ask to organize or save something to Notion:

1. Fetch the existing paper page first.
2. Preserve its existing structure and writing style.
3. Extract only content worth keeping from the study conversation.
4. Convert conversational explanations into concise study notes.
5. Add the content in an appropriate location without overwriting unrelated existing notes.

Do not force a universal paper-note template.
The structure of each page may differ depending on what I studied.

---

## Study Completion

While studying, `Done` should remain unchecked unless I explicitly indicate that the paper is finished.

When I say the paper is finished or ask to complete it:

1. Review the main concepts actually studied.
2. Update `Keys` with a concise set of important concepts.
3. Mark `Done` as complete.
4. Keep the existing database schema unchanged.

`Keys` should remain concise and useful for future retrieval.

Examples from my existing style:
- DQN: `Deep Q-learning, experience replay, target network`
- π0: `Flow matching, action expert, action chunking`

---

## Code and Experiments

Use:

```text
code/implementations/
```

for implementations or reproductions of existing papers.

Use:

```text
code/experiments/
```

for my own experimental work or research ideas.

Keep reproduction code and original experiments separate.

---

## Core Principle

Automate:
- paper discovery
- metadata retrieval
- paper file organization
- naming and categorization
- existing-note retrieval
- research-context retrieval
- Notion formatting and updates when requested
- final `Keys` / `Done` bookkeeping

Do not automate away:
- my choice of what to study
- my reading process
- my questions
- the interactive reasoning process
- my decision about what knowledge is worth preserving

The system should make research study easier without making the study process feel fundamentally different from how I already work.
