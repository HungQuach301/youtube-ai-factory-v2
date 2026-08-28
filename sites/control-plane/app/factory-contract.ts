export const approvedChannel = {
  id: "channel_ai_era_money_defense_v1",
  name: "AI-Era Money Defense",
  nicheKey: "ai-era-money-defense",
  market: "United States",
  locale: "en-US",
  identityContractId: "identity_ai_era_money_defense_v1",
  identityVersion: 1,
  ownerDecisionKey: "HP-01:AI-ERA-MONEY-DEFENSE:2026-08-25",
  viewerPromise: "See the trap before it touches your money.",
  audience: "Adults 30–55 managing household money and supporting aging parents",
  format: "Premium faceless documentary / explainer",
  positioning: "Evidence-led explainers showing how AI, social engineering and digital payments are used to take household money, and the verification habits that interrupt the loss.",
  pillar: {
    id: "pillar_modern_money_traps_v1",
    name: "How Modern Money Traps Work",
    version: 1,
  },
  episodes: [
    "The Bank Fraud Alert That Sends Your Money to the Scammer",
    "Your Boss’s Voice Is Real. The Payment Request Isn’t",
    "The Wrong Number Text: Inside a 30-Day Scam Funnel",
    "Why Instant Payments Are So Hard to Reverse",
    "The AI Investment Ad That Never Existed",
    "From Data Breach to Perfect Impersonation",
    "The Fake Job That Turns You Into a Money Mule",
    "The Family Emergency Call and the Voice-Clone Trap",
    "The “Safe Account” Lie: How Bank Impersonation Hijacks Trust",
    "The 10-Minute Verification Routine Before Moving Money",
  ],
  controls: {
    profile: "REDUCED",
    videoCeilingUsd: 30,
    trackGCeilingUsd: 350,
    disclosure: "ON",
    soundscape: "ambience_only",
    autoPublish: false,
  },
} as const;

export const activationBlockers = [
  "qualified_voice_fingerprint",
  "critic_qualification_and_real_calibration_evidence",
] as const;

export const qualifiedVoice = {
  voiceId: "KXyrWqXTuK63FlJ9XZ33",
  model: "eleven_multilingual_v2",
  settings: {
    provider: "elevenlabs",
    capabilityId: "tts-elevenlabs-ai-era-money-defense",
    version: "elevenlabs-tts-v1",
    voiceId: "KXyrWqXTuK63FlJ9XZ33",
    modelId: "eleven_multilingual_v2",
    voiceSettings: {
      stability: 0.7,
      similarityBoost: 0.75,
      style: 0,
      useSpeakerBoost: true,
      speed: 1.02,
    },
    outputFormat: "mp3_44100_128",
    usdPer1000Chars: 0.1,
  },
  settingsHash: "5c982c8851e1cba1b23b515a6d1d9f98c78d7ce4eabf6e2a3e13a91cd7e76ed9",
  capabilityId: "tts-elevenlabs-ai-era-money-defense",
  capabilityVersion: "elevenlabs-tts-v1",
  fingerprintDurationSec: 30,
  fingerprintR2Key: "qual/identity/channel_ai_era_money_defense_v1/voice/KXyrWqXTuK63FlJ9XZ33/5c982c8851e1cba1b23b515a6d1d9f98c78d7ce4eabf6e2a3e13a91cd7e76ed9/voice-fingerprint-30s.flac",
  pronunciationLexiconRef: "lexicon/ai-era-money-defense/en-US/v1",
} as const;

export const audioArchetypes = [
  "high_energy_hook",
  "number_heavy_narration",
  "dense_mechanism",
  "authorization_clearing_settlement",
  "long_section_continuity",
  "causal_sfx_ambience",
  "music_transition",
  "silence_consequence_payoff",
] as const;
