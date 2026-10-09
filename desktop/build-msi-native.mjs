// Native macOS/Linux MSI compiler fallback. Packages electron-builder's already
// built Windows payload, never another renderer. Windows releases can keep using
// WiX/signing directly through electron-builder.config.cjs.
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { addMsiWizard } from "./msi-wizard.mjs";
const require = createRequire(import.meta.url);
const config = require("./electron-builder.config.cjs");
const { version } = require("./package.json");
const work = path.resolve(process.argv[2]);
if (process.env.STOA_DISTRIBUTION_BUILD === "1") throw new Error("Use the Windows signing runner for commercial MSI builds; this native fallback is unsigned.");
const app = path.join(work, "win-unpacked");
const xml = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const id = (value) => `s${createHash("sha256").update(value).digest("hex").slice(0, 30)}`;
const guid = (value) => {
  const bytes = createHash("sha256").update(`${config.appId}:${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};
const components = [];
function files(relative = "") {
  return readdirSync(path.join(app, relative), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name)).map((entry) => {
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) return `<Directory Id="${id(`dir:${name}`)}" Name="${xml(entry.name)}">${files(name)}</Directory>`;
    if (!entry.isFile()) throw new Error(`Unexpected payload entry: ${name}`);
    const component = id(`component:${name}`);
    components.push(component);
    return `<Component Id="${component}" Guid="${guid(name)}" Win64="yes"><File Id="${name === "STOA.exe" ? "MainExe" : id(name)}" Source="${xml(path.join(app,name))}" Name="${xml(entry.name)}" KeyPath="yes"/></Component>`;
  }).join("\n");
}
const tree = files();
const source = `<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
 <Product Id="${randomUUID()}" Name="STOA" Language="1033" Version="${version}" Manufacturer="STOA" UpgradeCode="${config.msi.upgradeCode}">
  <Package InstallerVersion="500" Compressed="yes" InstallScope="perUser" Description="STOA ${version} for Windows x64"/>
  <MajorUpgrade AllowSameVersionUpgrades="yes" DowngradeErrorMessage="A newer version of STOA is already installed."/>
  <Media Id="1" Cabinet="stoa.cab" EmbedCab="yes"/>
  <Property Id="STOAWINDOWSBUILD"><RegistrySearch Id="WindowsBuild" Root="HKLM" Key="SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion" Name="CurrentBuildNumber" Type="raw" Win64="yes"/></Property>
  <Condition Message="STOA requires 64-bit Windows 10 or later.">Installed OR (VersionNT64 AND STOAWINDOWSBUILD &gt;= 10240)</Condition>
  <Icon Id="STOAIcon" SourceFile="${xml(path.join(work,".icon-ico/icon.ico"))}"/>
  <Property Id="ARPPRODUCTICON" Value="STOAIcon"/>
  <Directory Id="TARGETDIR" Name="SourceDir">
   <Directory Id="LocalAppDataFolder"><Directory Id="LocalPrograms" Name="Programs"><Directory Id="APPLICATIONFOLDER" Name="STOA">${tree}
    <Component Id="FileAssociation" Guid="${guid("file-association")}" Win64="yes">
     <RegistryValue Root="HKCU" Key="Software\\Classes\\.stoa" Type="string" Value="STOA.stoa" KeyPath="yes"/>
     <RegistryValue Root="HKCU" Key="Software\\Classes\\STOA.stoa" Type="string" Value="STOA interlinear project"/>
     <RegistryValue Root="HKCU" Key="Software\\Classes\\STOA.stoa\\DefaultIcon" Type="string" Value="&quot;[APPLICATIONFOLDER]STOA.exe&quot;,0"/>
     <RegistryValue Root="HKCU" Key="Software\\Classes\\STOA.stoa\\shell\\open\\command" Type="string" Value="&quot;[APPLICATIONFOLDER]STOA.exe&quot; &quot;%1&quot;"/>
    </Component>
   </Directory></Directory></Directory>
   <Directory Id="ProgramMenuFolder"><Directory Id="STOAMenu" Name="STOA">
    <Component Id="StartShortcut" Guid="${guid("start-shortcut")}" Win64="yes">
     <Shortcut Id="StartShortcutLink" Name="STOA" Target="[APPLICATIONFOLDER]STOA.exe" WorkingDirectory="APPLICATIONFOLDER" Icon="STOAIcon"/>
     <RemoveFolder Id="RemoveMenu" On="uninstall"/>
     <RegistryValue Root="HKCU" Key="Software\\STOA" Name="StartShortcut" Type="integer" Value="1" KeyPath="yes"/>
    </Component>
   </Directory></Directory>
   <Directory Id="DesktopFolder">
    <Component Id="DesktopShortcut" Guid="${guid("desktop-shortcut")}" Win64="yes">
     <Shortcut Id="DesktopShortcutLink" Name="STOA" Target="[APPLICATIONFOLDER]STOA.exe" WorkingDirectory="APPLICATIONFOLDER" Icon="STOAIcon"/>
     <RegistryValue Root="HKCU" Key="Software\\STOA" Name="DesktopShortcut" Type="integer" Value="1" KeyPath="yes"/>
    </Component>
   </Directory>
  </Directory>
  <Feature Id="Main" Title="STOA" Level="1">${[...components,"FileAssociation","StartShortcut","DesktopShortcut"].map((item) => `<ComponentRef Id="${item}"/>`).join("")}</Feature>
 </Product>
</Wix>`;
const manifest = path.join(work, "stoa-native.wxs");
writeFileSync(manifest, source);
execFileSync("wixl", ["-a","x64","-o",path.join(work,config.msi.artifactName),manifest],{stdio:"inherit"});
addMsiWizard(path.join(work, config.msi.artifactName), work);
const summary = execFileSync("msiinfo",["suminfo",path.join(work,config.msi.artifactName)],{encoding:"utf8"});
if (!summary.includes("x64;1033")) throw new Error(`Incorrect MSI architecture: ${summary}`);
console.log(summary);
console.log(`MSI payload: ${components.length} files, ${readFileSync(path.join(work,config.msi.artifactName)).length} bytes`);
