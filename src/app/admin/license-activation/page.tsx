import ActivationKeyAdminPage from "../license-key/page";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function LicenseActivationPage() {
  return (
    <>
      <div className="fixed left-4 top-4 z-[1300] rounded-full border border-emerald-300/30 bg-emerald-400 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-lg">
        最新開通流程 2026.07.17-3
      </div>
      <ActivationKeyAdminPage />
    </>
  );
}
