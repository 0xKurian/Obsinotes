import {
  PageSizePreset,
  PageOrientation,
  PaperTemplateType
} from "../types";

export interface NotePagesSettings {
  defaultPageSize: PageSizePreset;
  defaultOrientation: PageOrientation;
  defaultTemplate: PaperTemplateType;
  drawWithFinger: boolean;
  autosaveIntervalMs: number;
  defaultLineColor: string;
  defaultLineSpacing: number;
  defaultPaperBackground: string;
  feedbackUrl: string;
}

export const DEFAULT_SETTINGS: NotePagesSettings = {
  defaultPageSize: "A4",
  defaultOrientation: "portrait",
  defaultTemplate: "ruled",
  drawWithFinger: false,
  autosaveIntervalMs: 1000,
  defaultLineColor: "#94a3b8",
  defaultLineSpacing: 24,
  defaultPaperBackground: "#ffffff",
  feedbackUrl: "https://docs.google.com/forms/d/e/1FAIpQLSeP3GLlOFJzvoTfJ4lVFXmvIGDNLdk_NyyQ909papxkeJXL9g/viewform"
};
