# paper

Personal research workspace for robotics and AI paper study.

## Purpose

This repository stores research source material, code, experiments, and workflow instructions used while studying papers with ChatGPT/Codex.

The long-term study notes themselves live in the existing Notion database:

`Robotics → 로보틱스 논문 → Papers`

GitHub and Notion intentionally have different roles:

- **GitHub**: paper files, code, experiments, workflow instructions
- **Notion**: knowledge worth preserving after studying
- **ChatGPT**: paper discovery, context retrieval, interactive Q&A, and organization
- **Codex**: implementation and experiments

## Repository structure

```text
paper/
├── papers/
│   ├── RL/
│   ├── VLA/
│   ├── VLM/
│   ├── CV/
│   └── Attention/
├── code/
│   ├── implementations/
│   └── experiments/
├── prompts/
│   └── research_agent.md
└── .gitignore
```

## Paper naming convention

Paper files should follow the same category and numbering scheme used in Notion when practical.

Examples:

- `RL_02_DQN.pdf`
- `VLA_04_OpenVLA.pdf`
- `Attention_02_BERT.pdf`

The authoritative study status, metadata, Keys, and completed notes remain in Notion rather than being duplicated here.

## Study workflow

1. Find or select a paper.
2. Save the paper under the matching `papers/<Tag>/` folder.
3. Register or locate the corresponding entry in the existing Notion Papers database.
4. Study interactively with ChatGPT and ask questions freely.
5. When useful, ask ChatGPT to add the learned content to the existing Notion page.
6. When the paper is finished, update `Keys` and `Done` in Notion.
7. Use `code/implementations/` for paper reproduction and `code/experiments/` for original experiments.

See `prompts/research_agent.md` for the operating rules used across new chats.
