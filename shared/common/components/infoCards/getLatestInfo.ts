export type LatestInfo = {
  latestBlogPost: {
    title: string;
    url: string;
    publishedTimestamp: number;
    imageUrl: string;
    imageBrightness: number;
  };
  latestUpdate: {
    title: string;
    url: string;
  };
  latestReleaseVersion: {major: number; minor: number};
};

const fallbackLatestInfo: LatestInfo = {
  latestBlogPost: {
    title: "Building with the UI starter kit",
    url: "https://example.com/blog/ui-starter",
    publishedTimestamp: Date.now() - 1000 * 60 * 60 * 24 * 7,
    imageUrl:
      "https://images.unsplash.com/photo-1529101091764-c3526daf38fe?auto=format&fit=crop&w=1200&q=80",
    imageBrightness: 0.8,
  },
  latestUpdate: {
    title: "Template-ready: components, layouts, and patterns",
    url: "https://example.com/updates/template-ready",
  },
  latestReleaseVersion: {major: 1, minor: 0},
};

export function useLatestInfo() {
  return fallbackLatestInfo;
}
