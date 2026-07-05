/**
 * Central Hebrew copy for the whole UI. The app is Hebrew-only and renders
 * right-to-left (see <html dir="rtl"> in app/layout.tsx). Keeping all strings
 * here makes wording easy to tweak in one place.
 */
export const he = {
  app: {
    title: "מסמך לאודיו",
    description: "הפכו את המסמכים שלכם לאודיו שתוכלו להאזין לו בכל מקום.",
  },

  auth: {
    signInTitle: "התחברות",
    registerTitle: "יצירת חשבון",
    signInDescription: "הזינו אימייל וסיסמה כדי לגשת לספרייה שלכם.",
    registerDescription: "הירשמו כדי להתחיל להמיר מסמכים לאודיו.",
    emailLabel: "אימייל",
    emailPlaceholder: "name@example.com",
    passwordLabel: "סיסמה",
    passwordPlaceholder: "••••••••",
    pleaseWait: "אנא המתינו…",
    signInButton: "התחברות",
    createAccountButton: "יצירת חשבון",
    noAccountPrompt: "אין לכם חשבון? ",
    haveAccountPrompt: "כבר יש לכם חשבון? ",
    signUpLink: "הרשמה",
    signInLink: "התחברות",
  },

  library: {
    heading: "הספרייה שלי",
    signOut: "התנתקות",
    upload: "העלאה",
    uploading: "מעלה…",
    uploadFiles: (n: number) => `העלאת ${n} קבצים`,
    uploadingProgress: (done: number, total: number) => `${done}/${total} מועלים…`,
    newFolder: "תיקייה חדשה",
    creating: "יוצר…",
    folderNamePlaceholder: "שם התיקייה",
    emptyTitle: "אין כאן עדיין כלום",
    emptyDescription: "העלו מסמך למעלה כדי להמיר אותו לאודיו.",
    foldersHeading: "תיקיות",
    filesHeading: "קבצים",
    rootFilesHeading: "קבצים ללא תיקייה",
    noFilesHere: "אין כאן קבצים עדיין.",
    convertAll: "המרת כל הקבצים",
    convertAllDone: (n: number) => `${n} קבצים הועברו להמרה`,
    convertAllError: "חלק מהקבצים לא הועברו",
  },

  file: {
    play: "השמעה",
    view: "מעקב",
    convert: "המרה",
    retry: "נסה שוב",
    deleteFile: "מחיקת קובץ",
    deleteFolder: "מחיקת תיקייה",
    rename: "שינוי שם",
    renameAriaLabel: "שינוי שם הקובץ",
    move: "העבר לתיקייה",
    moveRoot: "ללא תיקייה",
    provider: "מנוע",
    providerGemini: "Gemini",
    providerAzure: "Azure",
    multiColumn: "פריסת רב-טורים",
    multiColumnHint: "סדר מחדש עמודים בעלי שני טורים (עיתונים) לפני ההקראה",
    share: "שיתוף",
    shareCopied: "קישור הועתק!",
    restart: "הפעל מחדש",
    interrupted: "הופסק",
  },

  tts: {
    budgetTitle: "מכסת Gemini להיום",
    pagesLeftPrefix: "נותרו כ-",
    pagesLeftSuffix: "עמודים (משוער)",
    requestsLeft: "בקשות שנותרו",
    exhausted: "מכסת Gemini היומית נגמרה — בחרו Azure להמרה",
    resetsInPrefix: "מתאפס בעוד",
    azureHint: "כשנגמרת המכסה, בחרו Azure ליד כפתור ההמרה.",
    azureUnavailable: "Azure עדיין לא מוגדר בשרת.",
    loading: "טוען מכסה…",
  },

  status: {
    PENDING: "ממתין",
    PROCESSING: "מעבד",
    DONE: "מוכן",
    ERROR: "שגיאה",
  },

  player: {
    failedTitle: "ההמרה נכשלה",
    failedDescription: "משהו השתבש בעת יצירת האודיו עבור המסמך הזה.",
    backToLibrary: "חזרה לספרייה",
    generating: "יוצר אודיו…",
    queued: "ממתין בתור להמרה…",
    autoUpdate: "הדף יתעדכן אוטומטית כשהאודיו יהיה מוכן.",
    libraryLink: "ספרייה",
    nowPlaying: "מתנגן כעת",
    nowPlayingDescription: "האזינו למסמך שהומר לאודיו.",
    restart: "הפעל מחדש",
    stuckHint: "ההמרה נראית תקועה — ייתכן שהשרת הופסק",
    viewDoc: "צפייה במסמך המקורי",
    viewDocUnsupported: "סוג קובץ זה אינו תומך בצפייה מוטבעת.",
  },

  audio: {
    seek: "מעבר",
    back15: "אחורה 15 שניות",
    forward15: "קדימה 15 שניות",
    play: "השמעה",
    pause: "השהיה",
    download: "הורדת MP3",
  },

  meta: {
    login: "התחברות — מסמך לאודיו",
    register: "הרשמה — מסמך לאודיו",
    library: "הספרייה — מסמך לאודיו",
    player: "נגן — מסמך לאודיו",
  },
} as const;
