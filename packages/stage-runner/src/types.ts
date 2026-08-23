import type {
  AcceptanceTest,
  Candidate,
  CapabilityRef,
  ChannelId,
  CommandResult,
  DeterministicMeasurements,
  DoRResult,
  FencingToken,
  Hex64,
  PackageId,
  PreflightResult,
  ProfileName,
  RunContext,
  StageInstanceId,
  TraceId,
} from '@youtube-ai-factory/contracts'
import type { ExecuteCommand } from '@youtube-ai-factory/core-command'

export const STAGE_LIFECYCLE_STEPS = [
  'RESOLVE_DOR',
  'VALIDATE_INPUT',
  'PRODUCE_CANDIDATES',
  'TOURNAMENT',
  'PREFLIGHT',
  'PRODUCE_ARTIFACT',
  'READ_BACK_VERIFY',
  'VERIFY_ARTIFACT',
  'FREEZE_STAGE',
] as const

export type StageLifecycleStep = typeof STAGE_LIFECYCLE_STEPS[number]
export type StartingControlState = 'NOT_STARTED' | 'REOPENED'

export interface StageRunRecord {
  readonly stageInstanceId: StageInstanceId
  readonly packageId: PackageId
  readonly channelId: ChannelId
  readonly traceId: TraceId
  readonly fencingToken: FencingToken
  readonly attemptOrdinal: number
  readonly controlState: StartingControlState
  readonly profile: ProfileName
  readonly actorIdentity: string
  readonly input: unknown
  readonly inputHash: Hex64
  readonly measurements: DeterministicMeasurements
}

export interface StageRunRepository {
  load(stageInstanceId: StageInstanceId): Promise<StageRunRecord>
}

export interface StageDoRPort {
  resolve(input: {
    readonly stage: StageRunRecord
    readonly requiredCapabilities: readonly CapabilityRef[]
  }): Promise<DoRResult>
}

export interface TournamentInput<Out> {
  readonly candidates: readonly Candidate<Out>[]
  readonly context: RunContext
  readonly acceptanceTests: (output: Out) => readonly AcceptanceTest[]
}

export interface StageTournamentPort {
  select<Out>(input: TournamentInput<Out>): Promise<Candidate<Out>>
}

export interface StoredArtifact {
  readonly artifactId: string
  readonly contentHash: Hex64
  readonly evidenceHashes: readonly Hex64[]
}

export interface StageArtifactPort {
  produce<Out>(input: {
    readonly stage: StageRunRecord
    readonly stageCode: string
    readonly champion: Candidate<Out>
    readonly preflight: Extract<PreflightResult, { readonly ok: true }>
  }): Promise<StoredArtifact>
}

export type ReadBackResult =
  | { readonly ok: true; readonly evidenceHashes: readonly Hex64[] }
  | { readonly ok: false; readonly failures: readonly string[]; readonly evidenceHashes: readonly Hex64[] }

export interface StageVerificationPort {
  readBack<Out>(input: {
    readonly stage: StageRunRecord
    readonly artifact: StoredArtifact
    readonly expected: Out
    readonly acceptanceTests: readonly AcceptanceTest[]
  }): Promise<ReadBackResult>
}

export interface StageCommandPort {
  execute(command: ExecuteCommand): Promise<CommandResult>
}

export type StageLifecycleErrorCode =
  | 'DOR_FAILED'
  | 'INPUT_SCHEMA_INVALID'
  | 'INPUT_IDENTITY_MISMATCH'
  | 'NO_CANDIDATES'
  | 'INVALID_CHAMPION'
  | 'PREFLIGHT_FAILED'
  | 'PREFLIGHT_EVIDENCE_MISSING'
  | 'NO_ACCEPTANCE_TESTS'
  | 'READ_BACK_FAILED'
  | 'READ_BACK_EVIDENCE_MISSING'
  | 'COMMAND_REJECTED'
  | 'COMMAND_STATE_MISMATCH'

export interface StageFailureEvidence {
  readonly stage: StageRunRecord
  readonly step: StageLifecycleStep
  readonly code: StageLifecycleErrorCode
  readonly failures: readonly string[]
  readonly evidenceHashes: readonly Hex64[]
}

export interface StageEvidencePort {
  recordFailure(input: StageFailureEvidence): Promise<void>
}

export interface StageLifecycleObserver {
  onStep(input: {
    readonly stage: StageRunRecord
    readonly step: StageLifecycleStep
  }): Promise<void>
}

export interface StageRunnerPorts {
  readonly repository: StageRunRepository
  readonly dor: StageDoRPort
  readonly tournament: StageTournamentPort
  readonly artifacts: StageArtifactPort
  readonly verification: StageVerificationPort
  readonly commands: StageCommandPort
  readonly evidmyßkh‘éì¶»§q«^u^[™ÈİYÙT[›™\š^\™R[œ]š^\™Sİ]]ˆÂˆ™XYÛ›HİYÙPÛÙHH	ÌL	Âˆ™XYÛ›HÙY[ÛÛ^Îˆ[ÛÛ^×HH×Bˆ™Y›YÚ™\İ[ˆ™Y›YÚ™\İ[HÈÚÎˆYK]šY[˜ÙR\Ú\ÎˆÑU’QSÑWÒTÒHBˆ›ÙXÙPØ[ÈH‚ˆ™\]Z\™YØ\Xš[]Y\Ê
Nˆ™XYÛ›HØ\Xš[]T™Y–×HÈ™]\›ˆĞĞTP’SUWHBˆ[œ]ØÚ[XJ
Nˆ‹–›Ù\Oš^\™R[œ]ˆÈ™]\›ˆ‹›Øš™Xİ
ÈÜXÎˆ‹œİš[™Ê
K›Z[ŠJHJKœİšXİ

HBˆ\Ş[˜È›ÙXÙJÚ[œ]ˆš^\™R[œ]ÛÛ^ˆ[ÛÛ^
Nˆ›ÛZ\ÙO™XYÛ›HØ[™Y]Oš^\™Sİ]]–×OˆÂˆ\Ëœ›ÙXÙPØ[È
ÏHBˆ\ËœÙY[ÛÛ^Ëœ\Ú
ÛÛ^
Bˆ™]\›ˆØØ[™Y]J
WBˆBˆ\Ş[˜È™Y›YÚ
ØØ[™Y]Nˆš^\™Sİ]]ÛÛ^ˆ™Y›YÚÛÛ^
Nˆ›ÛZ\ÙO™Y›YÚ™\İ[ˆÂˆ^Xİ
ÛÛ^œ›Ùš[JKĞ™J	Ô‘QPÑQ	ÊBˆ^Xİ
ÛÛ^™\ÚÛË”“Ñ’SK”‘QPÑQ
KĞ™J™\ÚÛË”“Ñ’SK”‘QPÑQ
Bˆ™]\›ˆ\Ëœ™Y›YÚ™\İ[ˆBˆXØÙ\[˜ÙU\İÊ
Nˆ™XYÛ›HXØÙ\[˜ÙU\İ×HÂˆ™]\›ˆŞÈÛÙNˆ	ÔĞÔ’TÓ“Ó—ÑSTIË\ØÜš\[Ûˆ	ÔØÜš\]\İ™H›Û‹Y[\K‰ÈWBˆBŸB‚™\ØÜšX™J	ÔİYÙT[›™\ˆœ˜[Y]ÛÜšÉË

HOˆÂˆ]
	Ù^Xİ]\ÈHX[™]ÜHš[™HY™XŞXÛH\Ù\È[™™XYÈ‘QPÑQ“Ñ’SIË\Ş[˜È

HOˆÂˆÛÛœİš^\™HHš^\™TÜÊ
BˆÛÛœİ[›™\ˆH™]Èš^\™T[›™\Šš^\™KœÜÊB‚ˆ]ØZ]^Xİ
[›™\‹œ[ŠÕQÑWÒQ
JKœ™\ÛÛ™\ËĞ™U[™Yš[™Y

B‚ˆ^Xİ
š^\™Kœİ\ÊKÑ\]X[
Âˆ	Ô‘TÓÓ‘WÑÔ‰Ëˆ	ÕSQUWÒS”U	Ëˆ	Ô“ÑPÑWĞĞS‘QUTÉËˆ	ÕÕT“SQS•	Ëˆ	Ô‘Q“QÒ	Ëˆ	Ô“ÑPÑWĞT•QPÕ	Ëˆ	Ô‘PQĞPÒ×Õ‘T’Q–IËˆ	Õ‘T’Q–WĞT•QPÕ	Ëˆ	Ñ”‘QV‘WÔÕQÑIËˆJBˆ^Xİ
š^\™K˜ÛÛ[X[™Ë›X\

ÛÛ[X[™
HOˆÛÛ[X[™\JJKÑ\]X[
Âˆ	ÔÕT•ÔÕQÑIË	Ô“ÑPÑWĞT•QPÕ	Ë	Õ‘T’Q–WĞT•QPÕ	Ë	Ñ”‘QV‘WÔÕQÑIËˆJBˆ^Xİ
[›™\‹œÙY[ÛÛ^ÖÌJKÓX]ÚØš™Xİ
Âˆ›Ùš[Nˆ	Ô‘QPÑQ	Ëˆ›Ùš[TÙ][™ÜÎˆ™\ÚÛË”“Ñ’SK”‘QPÑQˆJBˆJB‚ˆ]
	ÜİÜÈ]ÔˆÚ]™\›È›ÙXİ[ÛˆÛÜšÈ[™™\›ÈÛÛ[X[™ÚYHY™™XİÉË\Ş[˜È

HOˆÂˆÛÛœİš^\™HHš^\™TÜÊÈÜ”™XYNˆ˜[ÙHJBˆÛÛœİ[›™\ˆH™]Èš^\™T[›™\Šš^\™KœÜÊB‚ˆ]ØZ]^Xİ
[›™\‹œ[ŠÕQÑWÒQ
JKœ™Z™XİËÓX]ÚØš™Xİ
ÈÛÙNˆ	ÑÔ—ÑRSQ	ÈJBˆ^Xİ
š^\™Kœİ\ÊKÑ\]X[
ÉÔ‘TÓÓ‘WÑÔ‰×JBˆ^Xİ
[›™\‹œ›ÙXÙPØ[ÊKĞ™J
Bˆ^Xİ
š^\™K˜ÛÛ[X[™ÊKÒ]™S[™İ

Bˆ^Xİ
š^\™K˜Ûİ[\œË˜\Y˜Xİ
KĞ™J
BˆJB‚ˆ]
	Ü™Z™XİÈØÚ[XHY˜][È]Ûİ[]]]HØ[›ÛšXØ[[œ]Y[]IË\Ş[˜È

HOˆÂˆÛ\ÜÈY˜][[™Ô[›™\ˆ^[™Èš^\™T[›™\ˆÂˆİ™\œšYH[œ]ØÚ[XJ
Nˆ‹–›Ù\Oš^\™R[œ]ˆÂˆ™]\›ˆ‹›Øš™Xİ
ÈÜXÎˆ‹œİš[™Ê
K™Y˜][
	Ú[™[Y	ÊHJBˆBˆBˆÛÛœİ[\R[œ]HßBˆÛÛœİš^\™HHš^\™TÜÊÈİYÙNˆ™XÛÜ™
È[œ]ˆ[\R[œ][œ]\ÚˆØ[›ÛšXØ[\Ú
[\R[œ]
HJHJBˆÛÛœİ[›™\ˆH™]ÈY˜][[™Ô[›™\Šš^\™KœÜÊB‚ˆ]ØZ]^Xİ
[›™\‹œ[ŠÕQÑWÒQ
JKœ™Z™XİËÓX]ÚØš™Xİ
ÈÛÙNˆ	ÒS”UÒQS•UWÓRTÓPUÒ	ÈJBˆ^Xİ
š^\™K˜ÛÛ[X[™ÊKÒ]™S[™İ

Bˆ^Xİ
[›™\‹œ›ÙXÙPØ[ÊKĞ™J
BˆJB‚ˆ]
	Ü™XÛÜ™È]\›Z[š\İXÈ™Y›YÚ˜Z[\™HÚ]İ]ÙX[[™ÈÜˆ›ÙXÚ[™ÈHÙXÛÛ™™]š\Ú[Û‰Ë\Ş[˜È

HOˆÂˆÛÛœİš^\™HHš^\™TÜÊ
BˆÛÛœİ[›™\ˆH™]Èš^\™T[›™\Šš^\™KœÜÊBˆ[›™\‹œ™Y›YÚ™\İ[HÈÚÎˆ˜[ÙK˜Z[\™\ÎˆÉÙ\˜][ÛˆZ\ÛX]Ú	×HB‚ˆ]ØZ]^Xİ
[›™\‹œ[ŠÕQÑWÒQ
JKœ™Z™XİËÓX]ÚØš™Xİ
ÈÛÙNˆ	Ô‘Q“QÒÑRSQ	ÈJBˆ^Xİ
[›™\‹œ›ÙXÙPØ[ÊKĞ™JJBˆ^Xİ
š^\™K˜Ûİ[\œË˜\Y˜Xİ
KĞ™J
Bˆ^Xİ
š^\™K™˜Z[\™\ÊKÑ\]X[
ÉÔ‘Q“QÒ”‘Q“QÒÑRSQ	×JBˆ^Xİ
š^\™K˜ÛÛ[X[™Ë›X\

ÛÛ[X[™
HOˆÛÛ[X[™\JJKÑ\]X[
ÉÔÕT•ÔÕQÑI×JBˆJB‚ˆ]
	Ø›ØÚÜÈ‘T’Q–WĞT•QPÕ[™”‘QV‘WÔÕQÑHÚ[ˆ™XYX˜XÚÈ™\šYšXØ][Ûˆ˜Z[ÉË\Ş[˜È

HOˆÂˆÛÛœİš^\™HHš^\™TÜÊÈ™XY˜XÚÎˆÈÚÎˆ˜[ÙK˜Z[\™\ÎˆÉØÚXÚÜİ[HZ\ÛX]Ú	×K]šY[˜ÙR\Ú\ÎˆÑU’QSÑWÒTÒHHJBˆÛÛœİ[›™\ˆH™]Èš^\™T[›™\Šš^\™KœÜÊB‚ˆ]ØZ]^Xİ
[›™\‹œ[ŠÕQÑWÒQ
JKœ™Z™XİËÓX]ÚØš™Xİ
ÈÛÙNˆ	Ô‘PQĞPÒ×ÑRSQ	ÈJBˆ^Xİ
š^\™K˜ÛÛ[X[™Ë›X\

ÛÛ[X[™
HOˆÛÛ[X[™\JJKÑ\]X[
ÉÔÕT•ÔÕQÑIË	Ô“ÑPÑWĞT•QPÕ	×JBˆ^Xİ
š^\™K™˜Z[\™\ÊKÑ\]X[
ÉÔ‘PQĞPÒ×Õ‘T’Q–N”‘PQĞPÒ×ÑRSQ	×JBˆJB‚ˆ]
	İ™X]ÈZ\ÜÚ[™È™XYX˜XÚÈ]šY[˜ÙH\ÈH™XÛÜ™Y˜Z[XÛÜÙY™\İ[	Ë\Ş[˜È

HOˆÂˆÛÛœİš^\™HHš^\™TÜÊÈ™XY˜XÚÎˆÈÚÎˆYK]šY[˜ÙR\Ú\Îˆ×HHJBˆÛÛœİ[›™\ˆH™]Èš^\™T[›™\Šš^\™KœÜÊB‚ˆ]ØZ]^Xİ
[›™\‹œ[ŠÕQÑWÒQ
JKœ™Z™XİËÓX]ÚØš™Xİ
ÈÛÙNˆ	Ô‘PQĞPÒ×ÑU’QSÑWÓRTÔÒS‘ÉÈJBˆ^Xİ
š^\™K˜ÛÛ[X[™Ë›X\

ÛÛ[X[™
HOˆÛÛ[X[™\JJKÑ\]X[
ÉÔÕT•ÔÕQÑIË	Ô“ÑPÑWĞT•QPÕ	×JBˆ^Xİ
š^\™K™˜Z[\™\ÊKÑ\]X[
ÉÔ‘PQĞPÒ×Õ‘T’Q–N”‘PQĞPÒ×ÑU’QSÑWÓRTÔÒS‘É×JBˆJB‚ˆ]
	Ü™Z™XİÈHİ\›˜[Y[™\İ[]Ø\È›İ›ÙXÙYH\È][\	Ë\Ş[˜È

HOˆÂˆÛÛœİš^\™HHš^\™TÜÊÈ›Ü™ZYÛÚ[\[ÛˆYHJBˆÛÛœİ[›™\ˆH™]Èš^\™T[›™\Šš^\™KœÜÊB‚ˆ]ØZ]^Xİ
[›™\‹œ[ŠÕQÑWÒQ
JKœ™Z™XİËÓX]ÚØš™Xİ
ÈÛÙNˆ	ÒS•SQĞÒSTSÓ‰ÈJBˆ^Xİ
š^\™K˜Ûİ[\œË˜\Y˜Xİ
KĞ™J
Bˆ^Xİ
š^\™K˜ÛÛ[X[™Ë›X\

ÛÛ[X[™
HOˆÛÛ[X[™\JJKÑ\]X[
ÉÔÕT•ÔÕQÑI×JBˆJB‚ˆ]
	Ù\š]™\ÈY[XØ[ÛÛ[X[™Y[\İ[˜ŞHÙ^\È›ÜˆHØ[YH][\	Ë\Ş[˜È

HOˆÂˆÛÛœİš\œİHš^\™TÜÊ
BˆÛÛœİÙXÛÛ™Hš^\™TÜÊ
Bˆ]ØZ]™]Èš^\™T[›™\Šš\œİœÜÊKœ[ŠÕQÑWÒQ
Bˆ]ØZ]™]Èš^\™T[›™\ŠÙXÛÛ™œÜÊKœ[ŠÕQÑWÒQ
B‚ˆ^Xİ
š\œİ˜ÛÛ[X[™Ë›X\

ÛÛ[X[™
HOˆÛÛ[X[™šY[\İ[˜ŞRÙ^JJBˆÑ\]X[
ÙXÛÛ™˜ÛÛ[X[™Ë›X\

ÛÛ[X[™
HOˆÛÛ[X[™šY[\İ[˜ŞRÙ^JJBˆ^Xİ
™]ÈÙ]
š\œİ˜ÛÛ[X[™Ë›X\

ÛÛ[X[™
HOˆÛÛ[X[™šY[\İ[˜ŞRÙ^JJKœÚ^™JKĞ™J
BˆJBŸJB‚š]
	ÚÙY\ÈİÜ™Y\Y˜Xİ™Y™\™[˜Ù\È]šY[˜ÙKX›İ[™	Ë

HOˆÂˆÛÛœİ\Y˜XİˆİÜ™Y\Y˜XİHÂˆ\Y˜XİYˆ	Ø\Y˜XİLL	ËˆÛÛ[\ÚˆT•QPÕÒTÒˆ]šY[˜ÙR\Ú\ÎˆÑU’QSÑWÒTÒKˆBˆ^Xİ
\Y˜Xİ™]šY[˜ÙR\Ú\ÊKÒ]™S[™İ
JBŸJB