# macOS workstation build correction

The v1.0.3 release workflow builds from the `desktop` project directory and invokes the local electron-builder binary with `--publish=never`.

This prevents CI auto-publishing from interpreting the `desktop` directory as a release file and preserves a diagnostic artifact before GitHub Release publication.
