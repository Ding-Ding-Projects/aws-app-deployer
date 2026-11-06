# Tools: Base64 and file converter

Open **New tab** and choose **Tools**. Everything runs on this computer and nothing is uploaded.

## Base64 toolkit

Encode UTF-8 text, decode Base64 (standard or URL-safe), or turn any file up to 10 MB into Base64. Decoded data that is not UTF-8 text is reported as binary and can be saved as a file.

## File converter

Up to 25 MB per file: JSON to YAML or CSV, CSV to JSON or YAML, YAML to JSON (alias bombs are refused), Markdown to HTML (scripts and unsafe links are removed), and images between PNG, JPEG and WebP. Converting a transparent image to JPEG fills the transparency with white.

## Video and audio

Conversions to MP4 (H.264), WebM (VP9), GIF, MP3, WAV, Ogg (Opus) and M4A use FFmpeg. If FFmpeg is missing, **Install FFmpeg** installs it in one click with the Windows Package Manager; Windows may ask for permission, and the app never answers that prompt for you. Progress shows as a percentage, conversions can be cancelled, and the result is saved next to the original with a new name. Nothing is overwritten.

## Archives

The app includes the 7-Zip engine (7za) to make `.7z` archives and extract 7z, ZIP, TAR, GZ, XZ and BZ2. Extraction always goes to a new folder. RAR needs the full 7-Zip, which **Install 7-Zip** adds in one click.

## Open in an editor

Results can open in VS Code, when it is installed, or in the default app for that file type. The file is written to the `handoff` folder inside the app data folder first.
