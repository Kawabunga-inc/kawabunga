import type { VoiceProvider } from "@kawabunga/db";

export type LibraryMetricKind = "measured" | "list" | "estimated" | "unknown";
export type LibraryImportMode = "embedding" | "provider_id" | "clone";
export type ProviderAvailability =
  | "available"
  | "unavailable"
  | "temporarily_down"
  | "coming_soon";

export interface LibraryMetric {
  value: number | null;
  unit: string;
  kind: LibraryMetricKind;
  note?: string;
}
export interface LibraryLicense {
  name: string;
  url?: string;
  /** Undefined means unverified. Never coerce it to false. */
  commercialUse?: boolean;
  attributionRequired?: boolean;
  attribution?: string;
}

export interface LibrarySource {
  label: string;
  url?: string;
  previewUrl?: string;
  checksum?: string;
}

export interface LibraryImportState {
  kind: "not_imported" | "importing" | "imported";
  voiceId?: string;
  voiceSlug?: string;
  voiceStatus?: "active" | "archived";
  importedAt?: string;
  jobId?: string;
  phase?: VoiceImportPhase;
}

export interface LibraryVoice {
  provider: VoiceProvider;
  externalId: string;
  name: string;
  description?: string;
  previewUrl?: string;
  language?: string;
  languageLabel?: string;
  accent?: string;
  gender?: string;
  age?: string;
  useCase?: string;
  tags: string[];
  model?: string;
  cost: LibraryMetric;
  latency: LibraryMetric;
  license?: LibraryLicense;
  source: LibrarySource;
  importMode: LibraryImportMode;
  availability: "available" | "unavailable";
  unavailableReason?: string;
  importState: LibraryImportState;
}

export interface ProviderStatus {
  provider: VoiceProvider;
  label: string;
  availability: ProviderAvailability;
  count: number | null;
  importModes: LibraryImportMode[];
  reason?: string;
  errorCode?: string;
  retryAfterSeconds?: number;
  fallbackLabel?: string;
  fallbackHref?: string;
  cachedAt?: string;
}

export type VoiceLibrarySort = "curated" | "name";
export type VoiceLibraryLicenseFilter =
  | "commercial"
  | "unknown"
  | "noncommercial";
export type VoiceLibraryImportedFilter = "imported" | "not_imported";

export interface VoiceLibraryQuery {
  provider?: VoiceProvider;
  search?: string;
  language?: string;
  gender?: string;
  age?: string;
  useCase?: string;
  license?: VoiceLibraryLicenseFilter;
  imported?: VoiceLibraryImportedFilter;
  sort: VoiceLibrarySort;
  cursor?: string;
  limit: number;
}

export interface VoiceLibraryPage {
  voices: LibraryVoice[];
  providers: ProviderStatus[];
  nextCursor: string | null;
  total: number;
  fetchedAt: string;
}

export const VOICE_IMPORT_PHASES = [
  "fetching_source",
  "preparing_voice",
  "extracting_embedding",
  "storing_assets",
  "registering_voice",
  "ready",
] as const;

export type VoiceImportPhase = (typeof VOICE_IMPORT_PHASES)[number];
export type VoiceImportJobStatus =
  | "queued"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface VoiceImportConfig {
  provider: VoiceProvider;
  externalId: string;
  displayName: string;
  slug: string;
  language: string;
  gender?: string;
  tags: string[];
  licenseAccepted: boolean;
  allowDuplicate?: boolean;
}

export interface VoiceImportJob {
  id: string;
  provider: VoiceProvider;
  externalId: string;
  voiceId: string | null;
  voiceSlug: string | null;
  status: VoiceImportJobStatus;
  phase: VoiceImportPhase;
  completedPhases: VoiceImportPhase[];
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DuplicateVoicePayload {
  code: "VOICE_ALREADY_IMPORTED";
  existing: {
    id: string;
    slug: string;
    status: "active" | "archived";
    boundCharacterCount: number;
    importedAt: string;
  };
}
