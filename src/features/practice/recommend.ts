import type { Skill } from '@/database/repositories/practiceRepo';

export const SKILL_FA: Record<Skill, string> = {
  reading: 'خواندن',
  listening: 'شنیدن',
  writing: 'نوشتن',
  speaking: 'گفتاری (متنی)',
};

export const SKILL_BLURB_FA: Record<Skill, string> = {
  reading: 'معنی واژه را از روی جمله حدس بزنید.',
  listening: 'واژه یا جمله را بشنوید و تایپ کنید.',
  writing: 'با واژه‌های خودتان جمله بنویسید و بازخورد بگیرید.',
  speaking: 'به یک پرسش به سبک آیلتس، متنی پاسخ دهید.',
};

/** How many saved words each skill needs before it makes sense. */
export const MIN_WORDS: Record<Skill, number> = { reading: 4, listening: 1, writing: 1, speaking: 1 };

/**
 * Suggests the skill practised least in the recent window among those the
 * library can support. Ties follow the natural order. Returns null when the
 * library is too small for any skill.
 */
export function recommendSkill(recentCompleted: Record<Skill, number>, wordCount: number): Skill | null {
  const order: Skill[] = ['reading', 'listening', 'writing', 'speaking'];
  const feasible = order.filter((s) => wordCount >= MIN_WORDS[s]);
  if (feasible.length === 0) return null;
  return feasible.reduce((best, s) => (recentCompleted[s] < recentCompleted[best] ? s : best), feasible[0]);
}
