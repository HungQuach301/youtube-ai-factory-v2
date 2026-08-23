import type { MediaJobSpec } from './types.js'

export interface ToolInvocation {
  readonly executable: 'ffmpeg' | 'ffprobe' | 'whisperx' | 'mfa' | 'factory-flow' | 'factory-phash'
  readonly args: readonly string[]
  readonly outputPath: string
}

function inputPath(index: number): string {
  return `/work/input/${index}`
}

function outputPath(name: string): string {
  return `/work/output/${name}`
}

export function buildToolInvocation(spec: MediaJobSpec): ToolInvocation {
  const target = outputPath(spec.artifactName)
  switch (spec.operation) {
    case 'COMPOSITE': {
      const filter = spec.layout === 'OVERLAY'
        ? '[0:v][1:v]overlay=0:0[v]'
        : spec.layout === 'HSTACK' ? '[0:v][1:v]hstack=inputs=2[v]' : '[0:v][1:v]vstack=inputs=2[v]'
      return {
        executable: 'ffmpeg',
        args: ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', inputPath(spec.primaryInput), '-i', inputPath(spec.secondaryInput), '-filter_complex', filter, '-map', '[v]', '-an', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-c:v', 'ffv1', target],
        outputPath: target,
      }
    }
    case 'ENCODE':
      return {
        executable: 'ffmpeg',
        args: ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', inputPath(spec.input), '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-c:v', spec.codec === 'FFV1' ? 'ffv1' : 'libx264', ...(spec.codec === 'H264' ? ['-threads', '1', '-x264-params', 'nal-hrd=cbr:force-cfr=1'] : []), target],
        outputPath: target,
      }
    case 'ALIGN':
      return {
        executable: spec.engine === 'WHISPERX' ? 'whisperx' : 'mfa',
        args: ['--audio', inputPath(spec.audioInput), '--transcript', inputPath(spec.transcriptInput), '--output', target],
        outputPath: target,
      }
    case 'PROBE':
      return { executable: 'ffprobe', args: ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', inputPath(spec.input)], outputPath: target }
    case 'FLOW':
      return { executable: 'factory-flow', args: ['--input', inputPath(spec.input), '--output', target], outputPath: target }
    case 'PHASH':
      return { executable: 'factory-phash', args: ['--input', inputPath(spec.input), '--output', target], outputPath: target }
  }
}
