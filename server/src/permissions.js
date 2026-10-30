/**
 * صلاحيات مستخدمي التطبيق — تُخزَّن JSON في users.permissions.
 * NULL في القاعدة = كل الصلاحيات مفعّلة (الوضع الافتراضي للمستخدمين الحاليين والجدد).
 * reps: null = كل المندوبين؛ مصفوفة أسماء = تقييد الرؤية بزبائن هؤلاء المندوبين.
 */
export const DEFAULT_PERMISSIONS = {
  reps: null,
  canFilterByRep: true,
  showPhone: true,
  showWhatsapp: true,
  showVisits: true,
  showCategory: true,
  showShopClass: true,
  showGovernate: true,
  showAddress: true,
  canAddNote: true,
  canDrawRoute: true,
  canShareLocation: true,
  canUpdateLocation: true,
  canUpdateBoth: true,
  canRename: true,
  forceRealGps: true,
  canAddStore: true,
  showServerAddress: true,
  canDownloadMaps: true,
};

export function resolvePermissions(raw) {
  if (!raw) return { ...DEFAULT_PERMISSIONS };
  try {
    return { ...DEFAULT_PERMISSIONS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PERMISSIONS };
  }
}
