export const CATEGORIES = [
  "Campus events",
  "Career Opportunities",
  "Extracurriculars",
  "Personal",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];
export type ReviewStatus = "needs_review" | "confirmed";
export type TaskStatus = "suggested" | "accepted" | "discarded";
export type ActionKind = "explicit" | "suggestion";
export type RegistrationStatus = "unknown" | "registered" | "not_registered";

export type Screenshot = {
  id: string;
  filename: string;
  displayTitle: string;
  draftTitle: string;
  category: Category | null;
  draftCategory: Category | null;
  summary: string;
  ambiguities: string;
  titleLocked: boolean;
  imageUrl: string;
  ocrText: string;
  createdAt: string;
  processingStatus: string;
  extractionError: string | null;
};

export type ItemTask = {
  id: string;
  title: string;
  details: string;
  deadline: string;
  dueTime: string;
  supportingText: string;
  status: TaskStatus;
  kind: ActionKind;
  dateAmbiguous: boolean;
  completed: boolean;
};

export type SavedItem = {
  id: string;
  screenshotId: string;
  title: string;
  summary: string;
  category: Category;
  reviewStatus: ReviewStatus;
  supportingText: string;
  missing: string[];
  dateText: string;
  eventDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  location: string;
  meetingUrl: string;
  onCalendar: boolean;
  registrationRequired: boolean | null;
  registrationUrl: string;
  registrationDeadline: string;
  registrationStatus: RegistrationStatus;
  tasks: ItemTask[];
};

export type GalleryImage = {
  id: string;
  filename: string;
  title: string;
  imageUrl: string;
  createdAt: string;
  processingStatus: string;
  extractionError: string | null;
  categories: string[];
  itemCount: number;
  needsReview: boolean;
};

export type DashboardLine = {
  title: string;
  category: string;
  when: string;
  extra: string;
};

export type Dashboard = {
  timezone: string;
  todayDate: string;
  todayEvents: DashboardLine[];
  todayTasks: DashboardLine[];
  overdueTasks: DashboardLine[];
  upcomingEvents: DashboardLine[];
  upcomingTasks: DashboardLine[];
  needsReview: number;
};

export type SavedTask = {
  id: string;
  screenshotId: string;
  itemId: string | null;
  title: string;
  details: string | null;
  category: Category;
  deadline: string | null;
  supportingText: string;
  completed: boolean;
  createdAt: string;
  completedAt: string | null;
  imageUrl: string;
  filename: string;
  sourceTitle: string;
  kind: ActionKind;
  dateAmbiguous: boolean;
  eventDate: string | null;
};

export type SimilarImage = {
  id: string;
  filename: string;
  title: string;
  imageUrl: string;
  distance: number;
};

export type ImportResult = {
  screenshot: Screenshot;
  items: SavedItem[];
  notice: string | null;
  similar: SimilarImage[];
};

export type Health = {
  ok: boolean;
  ollama: { ok: boolean; message: string };
  tesseract: { ok: boolean; message: string };
  categories: string[];
  timezone: string;
};

export type ReviewMode = "import" | "source";

export type Review = {
  localUri: string | null;
  screenshot: Screenshot | null;
  items: SavedItem[];
  notice: string | null;
  mode: ReviewMode;
};

export type CalendarTask = {
  id: string;
  screenshotId: string;
  itemId: string | null;
  title: string;
  details: string | null;
  category: Category;
  deadline: string | null;
  dueTime: string | null;
  deadlineText: string | null;
  supportingText: string;
  completed: boolean;
  overdue: boolean;
  dateNeedsReview: boolean;
  imageUrl: string;
  filename: string;
  sourceTitle: string;
};

export type TaskCalendar = {
  timezone: string;
  today: string;
  tasks: CalendarTask[];
  undated: CalendarTask[];
  needsDateReview: CalendarTask[];
};
