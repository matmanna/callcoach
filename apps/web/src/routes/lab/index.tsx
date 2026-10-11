import LabTurnsRoute from "./turns/index.tsx";
export function renderLabRoute(path: string) { return import.meta.env.VITE_LAB_ENABLED && path === "/lab/turns" ? <LabTurnsRoute /> : null; }
