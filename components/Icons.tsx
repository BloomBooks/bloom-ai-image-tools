import React from "react";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  path: string;
}

export const Icon: React.FC<IconProps> = ({ path, className, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d={path} />
  </svg>
);

export const Icons = {
  History: "M3 3v5h5 M3.05 13A9 9 0 1 0 6 5.3L3 8",
  Save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8",
  Copy: "M8 4v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.24a2 2 0 0 0-.6-.16l-3.5-3.5a2 2 0 0 0-1.4-.6H10a2 2 0 0 0-2 2z M16 4v4h4 M4 8v12a2 2 0 0 0 2 2h8",
  Upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12",
  Download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",
  Check: "M20 6L9 17l-5-5",
  X: "M18 6L6 18M6 6l12 12",
  Link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  Layout: "M3 3h18v18H3z M9 3v18 M15 3v18",
  ArrowRight: "M5 12h14 M12 5l7 7-7 7",
  Pin: "M21.4 13.5L12 21.9 2.6 13.5a7 7 0 0 1 9.9-9.9 7 7 0 0 1 8.9 9.9z",
  Paste:
    "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 2h6",
  Refresh: "M23 4v6h-6 M1 20v-6h6 M20.49 15a9 9 0 1 1 2.12-9.36L23 10",
  MoveRight: "M13 5l7 7-7 7 M5 12h15",
  Info: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 16v-4 M12 8h.01",
  AlertTriangle:
    "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01",
  Gear:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09A1.65 1.65 0 0 0 9 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z",
};
