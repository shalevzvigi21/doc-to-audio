/**
 * Mobile Hebrew strings for Job C (mobile audio player experience).
 */
export const mobileC = {
  sleep: {
    title: "טיימר שינה",
    off: "כיבוי",
    min15: "15 דקות",
    min30: "30 דקות",
    min60: "60 דקות",
    endOfDoc: "בסוף המסמך",
    endShort: "בסוף",
    minutesLeft: (m: number) => `${m} דק׳`,
    ariaLabel: "טיימר שינה",
  },
  offline: {
    label: "אופליין",
    download: "הורדה",
    downloading: (percent: number) => `${percent}%`,
    saved: "נשמר",
    buttonAria: "הורדה להאזנה ללא אינטרנט",
    removeAria: "הסרה מהאזנה לא מקוונת",
  },
  player: {
    dragHandleAria: "גרירה מטה לסגירה",
  },
} as const;
