/**
 * Hebrew copy for the user administration dashboard (JOB ADMIN).
 */
export const mobileAdmin = {
  header: {
    title: "ניהול משתמשים",
    backToLibrary: "חזרה לספרייה",
  },
  pendingCard: {
    title: (count: number) => `ממתינים לאישור (${count})`,
    approve: "אשר",
    reject: "דחה",
    signedUpAt: "נרשם ב-",
  },
  summary: {
    totalUsers: "סך הכל משתמשים",
    newThisWeek: "חדשים השבוע",
    activeToday: "פעילים היום",
    activeWeek: "פעילים השבוע",
    activeMonth: "פעילים החודש",
    documentsConverted: "מסמכים שהומרו",
    audioHours: "שעות שמע",
    hoursUnit: "שעות",
  },
  chart: {
    title: "פעילות בימים האחרונים",
    signupsLegend: "הרשמות",
    loginsLegend: "כניסות",
    empty: "אין נתוני פעילות לתקופה זו",
    accessibleSummary: (signups: number, logins: number, days: number) =>
      `תרשים פעילות: סך הכל ${signups} הרשמות ו-${logins} כניסות ב-${days} הימים האחרונים`,
  },
  filters: {
    all: "הכל",
    pending: "ממתינים",
    approved: "מאושרים",
    rejected: "נדחו",
  },
  status: {
    APPROVED: "מאושר",
    PENDING: "ממתין",
    REJECTED: "נדחה",
    adminBadge: "מנהל",
  },
  table: {
    email: "אימייל",
    status: "סטטוס",
    signedUp: "נרשם",
    lastLogin: "כניסה אחרונה",
    logins: "כניסות",
    documents: "מסמכים",
    audioMinutes: "דקות שמע",
    actions: "פעולות",
  },
  users: {
    signedUpAt: "נרשם ב-",
    neverLoggedIn: "לא נכנס עדיין",
    noActions: "—",
  },
  actions: {
    approve: "אשר",
    reject: "דחה",
    block: "חסום",
    confirmReject: "בטוחים?",
    processing: "מעדכן…",
  },
  empty: {
    noUsers: "אין משתמשים במערכת",
    noPending: "אין משתמשים הממתינים לאישור",
    noApproved: "אין משתמשים מאושרים",
    noRejected: "אין משתמשים שנדחו",
  },
  errors: {
    generic: "אירעה שגיאה בביצוע הפעולה",
  },
} as const;
