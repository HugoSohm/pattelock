# Signature Windows (SignPath)

Les builds Windows de la release sont signés avec Authenticode via
[SignPath Foundation](https://signpath.org), gratuit pour les projets open source.
Sans configuration, le workflow publie des builds non signés, comme avant.

## Mise en place

1. Demander l'accès à SignPath Foundation pour le dépôt.
2. Dans SignPath : installer l'app GitHub SignPath sur le dépôt, puis créer le projet,
   la signing policy (par exemple `release-signing`) et l'artifact configuration en
   recopiant [`artifact-configuration.xml`](artifact-configuration.xml).
3. Dans GitHub, *Settings > Secrets and variables > Actions* :
   - secret `SIGNPATH_API_TOKEN` : le token API de l'utilisateur CI SignPath ;
   - variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`,
     `SIGNPATH_SIGNING_POLICY_SLUG`, `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG`.

La variable `SIGNPATH_ORGANIZATION_ID` active la signature dans
[`release.yml`](../.github/workflows/release.yml).

## Déroulé dans le workflow

1. `tauri build --no-bundle` : seul `pattelock.exe` est compilé.
2. SignPath signe `pattelock.exe`.
3. `tauri bundle --bundles nsis` emballe l'exe signé dans l'installeur.
4. SignPath signe l'installeur.
5. `tauri signer sign` refait le `.sig` de l'updater, puisque l'installeur a changé.
