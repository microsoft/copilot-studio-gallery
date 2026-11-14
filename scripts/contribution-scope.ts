export interface ChangedFile {
  filename: string;
  status: string;
  previous_filename?: string;
}

export const METADATA_LABEL = "allow-metadata-changes";
export const SITE_LABEL = "allow-site-changes";

const metadataPaths = new Set([
  "src/lib/submissionMetadata.ts",
  "submissions/README.md",
  "submissions/_template/metadata.json",
]);

export function classifyContributionFiles(files: ChangedFile[]) {
  const slugs = new Set<string>();
  const sites: string[] = [];
  const contracts: string[] = [];
  const generated: string[] = [];
  let payloadChanges = false;
  for (const file of files) {
    for (const path of [file.filename, file.previous_filename].filter((path): path is string => path !== undefined)) {
      if (metadataPaths.has(path)) {
        contracts.push(path);
      } else if (/^(?:src\/content\/(?:solutions|guides)|public\/bundles)\//.test(path)) {
        generated.push(path);
      } else {
        const submission = /^submissions\/([a-z0-9]+(?:-[a-z0-9]+)*)\//.exec(path);
        if (submission) {
          slugs.add(submission[1]);
          if (!/^submissions\/[^/]+\/(?:metadata\.json|README\.md)$/.test(path)) payloadChanges = true;
        } else {
          sites.push(path);
        }
      }
    }
  }
  return { slugs, sites, contracts, generated, payloadChanges };
}
