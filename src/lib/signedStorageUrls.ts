import { supabaseAdmin } from '../api/supabaseClient';

export type ParsedStorageRef = { bucket: string; path: string };

function safeDecodeStoragePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** 이미 브라우저에서 바로 열 수 있는 public object URL이면 서명 생략 */
export function isStoragePublicHttpUrl(value: string): boolean {
  const t = value.trim();
  if (!/^https?:\/\//i.test(t)) return false;
  try {
    const u = new URL(t);
    return /\/storage\/v1\/object\/public\//i.test(u.pathname);
  } catch {
    return false;
  }
}

/** Supabase Storage 공개/서명 URL이면 버킷·객체 경로를 분리하고, 아니면 defaultBucket + 원문 경로로 취급 */
export function parseStorageRef(value: string, defaultBucket: string): ParsedStorageRef {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    const m = url.pathname.match(/\/object\/(?:public|sign)\/([^/]+)\/(.+)/);
    if (m) return { bucket: m[1], path: safeDecodeStoragePath(m[2]) };
    const m2 = url.pathname.match(/\/object\/authenticated\/([^/]+)\/(.+)/);
    if (m2) return { bucket: m2[1], path: safeDecodeStoragePath(m2[2]) };
  } catch {
    /* plain path */
  }
  return { bucket: defaultBucket, path: safeDecodeStoragePath(trimmed) };
}

/**
 * 경로/URL 배열 순서를 유지한 채 버킷별로 createSignedUrls 호출.
 * (예: `.../object/public/dog-photos/owner/x.jpg` → bucket dog-photos, path owner/x.jpg)
 */
export async function fetchSignedUrlsForRefs(
  rawValues: string[],
  defaultBucket: string,
  expiresSec = 60 * 60,
): Promise<string[]> {
  if (!rawValues.length) return [];
  const out: string[] = new Array(rawValues.length).fill('');

  /** 관리자 앱: Storage RLS로 anon 서명이 막히는 경우가 많아 service_role 클라이언트로 서명 */
  const storage = supabaseAdmin.storage;

  rawValues.forEach((raw, origIndex) => {
    const trimmed = raw.trim();
    if (isStoragePublicHttpUrl(trimmed)) {
      out[origIndex] = trimmed;
    }
  });

  const toSign: { bucket: string; path: string; origIndex: number }[] = [];
  rawValues.forEach((raw, origIndex) => {
    if (out[origIndex]) return;
    const ref = parseStorageRef(raw, defaultBucket);
    toSign.push({ bucket: ref.bucket, path: ref.path, origIndex });
  });

  const byBucket = new Map<string, { path: string; origIndex: number }[]>();
  toSign.forEach((item) => {
    const list = byBucket.get(item.bucket) ?? [];
    list.push({ path: item.path, origIndex: item.origIndex });
    byBucket.set(item.bucket, list);
  });

  for (const [bucket, items] of byBucket) {
    const paths = items.map((i) => i.path);
    const { data, error } = await storage.from(bucket).createSignedUrls(paths, expiresSec);
    if (import.meta.env.DEV && error) {
      console.warn('[signedStorageUrls]', bucket, error.message);
    }
    if (error || !data) continue;
    items.forEach((item, i) => {
      const u = data[i]?.signedUrl;
      if (u) out[item.origIndex] = u;
    });
  }

  return out;
}

/** 강아지 사진: URL에 버킷이 없으면 dog-photos → 실패 시 profile-photos 재시도 */
export async function fetchSignedDogPhotoUrls(
  rawValues: string[],
  primaryBucket: string,
  fallbackBucket: string,
): Promise<string[]> {
  const first = await fetchSignedUrlsForRefs(rawValues, primaryBucket);
  const retryIndices = first
    .map((u, i) => (!u && rawValues[i]?.trim() ? i : -1))
    .filter((i) => i >= 0);
  if (retryIndices.length === 0) return first;

  const retryVals = retryIndices.map((i) => rawValues[i]);
  const second = await fetchSignedUrlsForRefs(retryVals, fallbackBucket);
  const merged = [...first];
  retryIndices.forEach((origIdx, j) => {
    if (second[j]) merged[origIdx] = second[j];
  });
  return merged;
}
