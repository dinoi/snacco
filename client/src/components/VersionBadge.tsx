import { useBuildColor } from "@/hooks/useBuildColor";

export function VersionBadge() {
  const buildInfo = useBuildColor();

  return (
    <div
      className="text-[10px] font-mono text-gray-500 border border-gray-700 rounded px-1.5 py-0.5 leading-none"
      style={{ borderColor: buildInfo.color, color: buildInfo.color }}
      title={buildInfo.timestamp}
    >
      {buildInfo.version}
    </div>
  );
}
