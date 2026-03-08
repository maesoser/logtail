package webtail

import "embed"

// WebAssets contains the embedded frontend assets
//
//go:embed web/dist/*
var WebAssets embed.FS
