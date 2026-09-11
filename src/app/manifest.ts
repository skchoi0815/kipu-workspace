import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "한국비정규교수노동조합 강원대분회",
    short_name: "강원대분회",
    description: "집행부 전용 업무 공간",
    start_url: "/",
    display: "standalone",
    background_color: "#F4F6FA",
    theme_color: "#111823",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
