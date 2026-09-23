const PAPER_GLOSSARY: Record<string, string> = {
  ablation: "요소 제거 비교 실험",
  action: "행동",
  affordance: "행동 가능성",
  agent: "에이전트",
  alignment: "정렬·일치",
  annotation: "주석",
  attention: "어텐션",
  autoregressive: "자기회귀적",
  baseline: "비교 기준 모델",
  benchmark: "평가 기준",
  bias: "편향",
  bottleneck: "정보 병목",
  calibration: "확률 보정",
  checkpoint: "학습 저장 지점",
  "closed loop": "폐루프",
  constraint: "제약 조건",
  control: "제어",
  convergence: "수렴",
  covariance: "공분산",
  dataset: "데이터셋",
  decoder: "디코더",
  demonstration: "시범 데이터",
  diffusion: "확산",
  "distribution shift": "분포 변화",
  dynamics: "동역학",
  embodiment: "신체화",
  embedding: "임베딩",
  encoder: "인코더",
  "end to end": "종단간",
  estimator: "추정량",
  "few shot": "소수 예시 학습",
  "fine tuning": "미세조정",
  generalization: "일반화",
  gradient: "기울기",
  grasping: "파지",
  inference: "추론",
  "imitation learning": "모방학습",
  latent: "잠재 변수",
  likelihood: "우도",
  loss: "손실",
  manipulation: "조작",
  multimodal: "다중양식",
  objective: "목적함수",
  observation: "관측",
  optimizer: "최적화기",
  "out of distribution": "분포 외",
  policy: "정책",
  posterior: "사후분포",
  pretraining: "사전학습",
  prior: "사전분포",
  prompt: "프롬프트",
  proprioception: "고유수용감각",
  regularization: "정규화",
  "reinforcement learning": "강화학습",
  representation: "표현",
  reward: "보상",
  robustness: "강건성",
  rollout: "정책 실행 궤적",
  semantic: "의미론적",
  state: "상태",
  token: "토큰",
  trajectory: "궤적",
  transformer: "트랜스포머",
  uncertainty: "불확실성",
  variance: "분산",
  "vision language action": "시각·언어·행동",
  "visual grounding": "시각적 지시 대상 연결",
  "zero shot": "무예시 추론",
};

export function lookupLocalMeaning(term: string): string | null {
  const normalized = normalizeTerm(term);
  if (!normalized) return null;
  const exact = PAPER_GLOSSARY[normalized];
  if (exact) return exact;

  const singular = singularize(normalized);
  return singular === normalized ? null : PAPER_GLOSSARY[singular] ?? null;
}

function normalizeTerm(term: string) {
  return term
    .toLowerCase()
    .replace(/[–—-]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularize(term: string) {
  if (term.endsWith("ies") && term.length > 4) return `${term.slice(0, -3)}y`;
  if (/(?:ses|xes|zes|ches|shes)$/u.test(term) && term.length > 4) return term.slice(0, -2);
  if (term.endsWith("s") && !term.endsWith("ss") && term.length > 2) return term.slice(0, -1);
  return term;
}
