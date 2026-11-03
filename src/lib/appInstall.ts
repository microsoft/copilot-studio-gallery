import { appSetupSchema, managedAppSchema, type AppSetup, type ManagedAppRecord } from "./schema";
import { publicAssetPath, SITE_ORIGIN } from "./site";

export const APP_INSTALLERS = {
  macos: "installers/install-app.sh",
  windows: "installers/install-app.ps1",
} as const;
export type AppInstallPlatform = keyof typeof APP_INSTALLERS;

export function appInstallInputs(templateValue: string, setup: AppSetup): string[] {
  const template = managedAppSchema.shape.template.parse(templateValue);
  const app = appSetupSchema.parse(setup);
  const slug = template.split("/")[3]!;
  const bindings = app.connectors.map((binding) => {
    let value = `${binding.connector}:${binding.mode}`;
    if (binding.connector === "shared_commondataserviceforapps" && binding.mode === "table") {
      if (!binding.table || !/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(binding.table)) {
        throw new Error("Dataverse table bindings require a logical table name, not a display label.");
      }
      value += `:${binding.table}`;
    }
    return value;
  });
  return [slug, ...bindings];
}

export function appInstallCommand(app: Pick<ManagedAppRecord, "template" | "app">, platform: AppInstallPlatform): string {
  const [slug, ...bindings] = appInstallInputs(app.template, app.app);
  const url = `${SITE_ORIGIN}${publicAssetPath(APP_INSTALLERS[platform])}`;
  if (platform === "windows") {
    const parameters = bindings.length ? ` -Binding ${bindings.map((value) => `'${value}'`).join(",")}` : "";
    return `& { $s=[Text.Encoding]::UTF8.GetString((Invoke-WebRequest -UseBasicParsing '${url}').RawContentStream.ToArray()); if([string]::IsNullOrWhiteSpace($s)){throw 'Installer download was empty.'}; & ([scriptblock]::Create($s)) -Submission '${slug}'${parameters} }`;
  }
  return `(set -e; f=$(mktemp); trap 'rm -f "$f"' EXIT; curl -fsSL '${url}' -o "$f"; if [ ! -s "$f" ]; then echo 'Installer download was empty.' >&2; exit 1; fi; bash "$f" ${[slug, ...bindings].join(" ")})`;
}
