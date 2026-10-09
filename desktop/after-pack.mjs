import { execFileSync } from "node:child_process";
import path from "node:path";

export default function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const application = path.join(context.appOutDir, "STOA.app");
  execFileSync("/usr/bin/xattr", ["-cr", application], { stdio: "inherit" });
  // Local QA builds use a recoverable ad-hoc signature. Once a Developer ID
  // identity is configured, electron-builder owns signing/notarization and this
  // hook must never overwrite the commercial signature.
  if (context.packager.platformSpecificBuildOptions.identity !== null) return;
  execFileSync("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", application], {
    stdio: "inherit",
  });
}
