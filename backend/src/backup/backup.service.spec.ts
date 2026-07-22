import * as crypto from 'crypto';
import { encryptBackup, decryptBackup, selectExpired, isDubaiSunday, isDubaiFirstOfMonth } from './backup.service';

describe('backup encryption', () => {
  it('round-trips plaintext through encrypt -> decrypt with the same key', () => {
    const key = crypto.randomBytes(32);
    const plaintext = Buffer.from('the entire business, allegedly');
    const blob = encryptBackup(key, plaintext);
    expect(decryptBackup(key, blob)).toEqual(plaintext);
  });

  it('fails closed on a wrong key (authenticated encryption, not just confidentiality)', () => {
    const key = crypto.randomBytes(32);
    const wrongKey = crypto.randomBytes(32);
    const blob = encryptBackup(key, Buffer.from('secret data'));
    expect(() => decryptBackup(wrongKey, blob)).toThrow();
  });

  it('fails closed on a tampered ciphertext', () => {
    const key = crypto.randomBytes(32);
    const blob = encryptBackup(key, Buffer.from('secret data'));
    blob[blob.length - 1] ^= 0xff; // flip the last byte
    expect(() => decryptBackup(key, blob)).toThrow();
  });
});

describe('backup retention (selectExpired)', () => {
  const obj = (name: string) => ({ name, updated_at: null, created_at: null, metadata: null });

  it('keeps the newest N, expires the rest', () => {
    const objects = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05'].map(obj);
    expect(selectExpired(objects, 3)).toEqual(['2026-07-02', '2026-07-01']);
  });

  it('expires nothing when under the keep count', () => {
    const objects = ['2026-07-01', '2026-07-02'].map(obj);
    expect(selectExpired(objects, 14)).toEqual([]);
  });

  it('never includes the newest object regardless of input order', () => {
    const objects = ['2026-07-03', '2026-07-01', '2026-07-02'].map(obj); // shuffled
    const expired = selectExpired(objects, 1);
    expect(expired).not.toContain('2026-07-03');
    expect(expired).toEqual(['2026-07-02', '2026-07-01']);
  });
});

describe('promotion day-boundary (Dubai-local, not UTC)', () => {
  it('treats the cron firing time (02:00 Dubai = 22:00 UTC previous day) as Sunday when Dubai-local is Sunday', () => {
    // Sunday 2026-07-26 02:00 Asia/Dubai == Saturday 2026-07-25 22:00 UTC.
    // A naive .getUTCDay() on this instant would read Saturday (6), not Sunday (0) — the bug this test guards against.
    const cronFireInstant = new Date('2026-07-25T22:00:00.000Z');
    expect(cronFireInstant.getUTCDay()).toBe(6); // sanity: UTC day really is Saturday at this instant
    expect(isDubaiSunday(cronFireInstant)).toBe(true); // but Dubai-local day is Sunday
  });

  it('does not treat a Monday-Dubai instant as Sunday', () => {
    // Monday 2026-07-27 02:00 Asia/Dubai == Sunday 2026-07-26 22:00 UTC.
    const cronFireInstant = new Date('2026-07-26T22:00:00.000Z');
    expect(cronFireInstant.getUTCDay()).toBe(0); // UTC day is Sunday...
    expect(isDubaiSunday(cronFireInstant)).toBe(false); // ...but Dubai-local day is Monday
  });

  it('treats the cron firing time for the 1st-of-month (Dubai-local) as a monthly promotion, even though UTC is still the last day of the prior month', () => {
    // 2026-08-01 02:00 Asia/Dubai == 2026-07-31 22:00 UTC.
    const cronFireInstant = new Date('2026-07-31T22:00:00.000Z');
    expect(cronFireInstant.getUTCDate()).toBe(31); // sanity: UTC date is still the 31st
    expect(isDubaiFirstOfMonth(cronFireInstant)).toBe(true); // but Dubai-local date is the 1st
  });
});
