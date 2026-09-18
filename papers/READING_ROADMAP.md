# 추천 논문 20편 · 읽기 순서

Notion의 `추천 20편 · 읽기 순서` 보기와 연결되는 로드맵입니다. 공부 기록과 완료 여부의 기준은 Notion입니다. 기존 분류와 논문 ID를 유지하며, 읽기 순서는 `Keys`의 `P0-01`~`P0-20`으로 표시합니다.

1–7: 생성모델·행동 생성 / 8–14: 시각 표현·VLM·적응 / 15–20: VLA·평가.

4번 Guide는 3번과 병행하는 참고 자료입니다. 20편 이후 OpenVLA·π0·CogACT를 비교 재독합니다. 연도는 신규 등록 논문의 arXiv 최초 공개 연도입니다.

| 순서 | 논문 | 공부할 내용 | 원문 | Notion |
|---|---|---|---|---|
| 01 | DDPM | 노이즈 예측 MSE가 행동 생성 손실이 되는 이유 | [paper](https://arxiv.org/abs/2006.11239) | [notes](https://app.notion.com/p/3df0ad69a5f881439a72fceeea290aef) |
| 02 | DDIM | 학습과 샘플링을 분리하고 적은 스텝으로 생성하는 원리 | [paper](https://arxiv.org/abs/2010.02502) | [notes](https://app.notion.com/p/3df0ad69a5f881fb8b23d0fdd8f4246e) |
| 03 | Flow matching | π0의 조건부 벡터장 회귀 목적함수 이해 | [paper](https://arxiv.org/abs/2210.02747) | [notes](https://app.notion.com/p/3df0ad69a5f88147a44ede7d3382f9ac) |
| 04 | Flow matching guide | flow matching의 수식과 구현을 함께 복습 | [paper](https://arxiv.org/abs/2412.06264) | [notes](https://app.notion.com/p/3df0ad69a5f88118a4b9ec7c12d93bad) |
| 05 | DiT | CogACT의 diffusion transformer 구조 이해 | [paper](https://arxiv.org/abs/2212.09748) | [notes](https://app.notion.com/p/3df0ad69a5f881fea6adf2f7783de608) |
| 06 | Diffusion Policy | diffusion을 closed-loop visuomotor policy에 연결 | [paper](https://arxiv.org/abs/2303.04137) | [notes](https://app.notion.com/p/3df0ad69a5f8817297f8d939ca0f5324) |
| 07 | ACT ALOHA | action chunk와 temporal ensemble의 기본 비교대상 | [paper](https://arxiv.org/abs/2304.13705) | [notes](https://app.notion.com/p/3df0ad69a5f8816997c8c3ac4a5a41a9) |
| 08 | ViT | 이미지를 토큰으로 바꾸는 구조 이해 | [paper](https://arxiv.org/abs/2010.11929) | [notes](https://app.notion.com/p/ccf0ad69a5f883a29dbc817c75c568b3) |
| 09 | CLIP | 이미지와 텍스트를 정렬하는 대조학습 | [paper](https://arxiv.org/abs/2103.00020) | [notes](https://app.notion.com/p/3df0ad69a5f88111b22ce244ec3f4836) |
| 10 | SigLIP | OpenVLA·π0 시각 인코더의 sigmoid 목적함수 | [paper](https://arxiv.org/abs/2303.15343) | [notes](https://app.notion.com/p/3df0ad69a5f88127a2e4fecd94fc3ef0) |
| 11 | DINOv2 | OpenVLA의 두 시각 인코더 중 하나를 분석 | [paper](https://arxiv.org/abs/2304.07193) | [notes](https://app.notion.com/p/3df0ad69a5f88155827dcaecf010613b) |
| 12 | Prismatic | OpenVLA와 CogACT의 VLM 설계 근거 | [paper](https://arxiv.org/abs/2402.07865) | [notes](https://app.notion.com/p/3df0ad69a5f88160bffad05ecff5bb66) |
| 13 | PaliGemma | π0 backbone의 시각·언어 결합 | [paper](https://arxiv.org/abs/2407.07726) | [notes](https://app.notion.com/p/3df0ad69a5f881e0b043c642f0fc87c0) |
| 14 | LoRA | VLA를 적은 학습 파라미터로 적응시키는 원리 | [paper](https://arxiv.org/abs/2106.09685) | [notes](https://app.notion.com/p/3df0ad69a5f8816fa43fc102c0e12e74) |
| 15 | OpenVLA OFT | OpenVLA를 읽은 뒤 가장 직접적인 행동 head 비교 | [paper](https://arxiv.org/abs/2502.19645) | [notes](https://app.notion.com/p/3df0ad69a5f881a9b4b1e8ee9cc90479) |
| 16 | FAST | 연속 action chunk를 효율적인 이산 토큰으로 압축 | [paper](https://arxiv.org/abs/2501.09747) | [notes](https://app.notion.com/p/3df0ad69a5f881d9a64cca94e37bcd52) |
| 17 | RoboVLMs | 이미 목록에 있는 VLA 설계 비교 연구를 우선 연결 | [paper](https://arxiv.org/abs/2412.14058) | [notes](https://app.notion.com/p/15f0ad69a5f8832db9520144eef30f79) |
| 18 | RTC | 이미 관심 있는 실행 지연과 chunk 연결 문제 | [paper](https://arxiv.org/abs/2506.07339) | [notes](https://app.notion.com/p/f500ad69a5f883db847e015fbaf1b4e2) |
| 19 | SmolVLA | 작은 VLA로 실험 범위를 설정하는 출발점 | [paper](https://arxiv.org/abs/2506.01844) | [notes](https://app.notion.com/p/3df0ad69a5f881ec95c5c1fea19ac44a) |
| 20 | LIBERO | 언어 조작의 지식 전이와 lifelong 평가 | [paper](https://arxiv.org/abs/2306.03310) | [notes](https://app.notion.com/p/3df0ad69a5f88125b7dcc558ad486a9a) |
