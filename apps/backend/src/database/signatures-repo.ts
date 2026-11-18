/**
 * Signature bundle persistence. The interface keeps routes independent of D1 so
 * tests can use the in-memory implementation.
 */

export type SignatureKind = 'technologies' | 'trackers';

export interface StoredBundle {
  version: string;
  bundleJson: string;
  createdAt: string;
}

export interface SignatureRepository {
  latest(kind: SignatureKind): Promise<StoredBundle | null>;
  save(kind: SignatureKind, version: string, bundleJson: string): Promise<void>;
}

const TABLES: Record<SignatureKind, string> = {
  technologies: 'technology_signatures',
  trackers: 'tracker_signatures',
};

export class D1SignatureRepository implements SignatureRepository {
  constructor(private readonly db: D1Database) {}

  async latest(kind: SignatureKind): Promise<StoredBundle | null> {
    // Table names come from a fixed map, never from user input.
    const row = await this.db
      .prepare(`SELECT version, bundle_json, created_at FROM ${TABLES[kind]} ORDER BY id DESC LIMIT 1`)
      .first<{ version: string; bundle_json: string; created_at: string }>();
    return row ? { version: row.version, bundleJson: row.bundle_json, createdAt: row.created_at } : null;
  }

  async save(kind: SignatureKind, version: string, bundleJson: string): Promise<void> {
    await this.db
      .prepare(`INSERT INTO ${TABLES[kind]} (version, bundle_json, created_at) VALUES (?1, ?2, ?3)`)
      .bind(version, bundleJson, new Date().toISOString())
      .run();
  }
}

export class MemorySignatureRepository implements SignatureRepository {
  private rows: Record<SignatureKind, StoredBundle[]> = { technologies: [], trackers: [] };
  async latest(kind: SignatureKind): Promise<StoredBundle | null> {
    return this.rows[kind].at(-1) ?? null;
  }
  async save(kind: SignatureKind, version: string, bundleJson: string): Promise<void> {
    this.rows[kind].push({ version, bundleJson, createdAt: new Date().toISOString() });
  }
}

/** Health probe for D1. */
export async function pingDatabase(db: D1Database): Promise<boolean> {
  try {
    await db.prepare('SELECT 1').first();
    return true;
  } catch {
    return false;
  }
}
