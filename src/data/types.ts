export type TagCategory =
  | "mood"
  | "emotion"
  | "atmosphere"
  | "genre"
  | "topic"
  | "readingStyle"
  | "personality";
export type Tag = {
  id: string;
  label: string;
  category: TagCategory;
  aliases?: string[];
  weight?: number;
};
export type UserTag = {
  id: string;
  originalText: string;
  normalizedText: string;
  mappedTagIds: string[];
  confidence: number;
  source: "custom";
};
export type Selection = {
  id: string;
  label: string;
  tagIds: string[];
  custom?: UserTag;
};
export type BookAvailability = {
  provider: string;
  type: "read" | "preview" | "borrow" | "ebook" | "buy" | "search" | "info";
  url: string;
  label: string;
  verified?: boolean;
  region?: string;
  checkedAt?: string;
  price?: { amount: number; currency: string };
};
export type Book = {
  id: string;
  title: string;
  originalTitle?: string;
  authorId: string;
  author: string;
  year?: number;
  originalLanguage?: string;
  country?: string;
  isbn10?: string;
  isbn13?: string;
  publisher?: string;
  pageCount?: number;
  tags: string[];
  semanticTags: string[];
  teaser: string;
  bookSummary: string;
  whyNow: string;
  readingNote: string;
  dimensions: {
    introspection: number;
    dreaminess: number;
    quietness: number;
    accessibility: number;
    aftertaste: number;
  };
  palette: { paper: string; ink: string; accent: string };
  coverUrl?: string;
  availability?: BookAvailability[];
};
export type Author = {
  id: string;
  name: string;
  originalName?: string;
  country?: string;
  shortBio: string;
  knownFor?: string[];
  externalLinks?: { label: string; url: string }[];
};
export type Draw = {
  bookId: string;
  time: number;
  selections: Selection[];
  matched: string[];
  exploration: boolean;
};
export type BoxState =
  | "idle"
  | "selecting"
  | "ready"
  | "dragging"
  | "opening"
  | "revealed"
  | "closing";
