import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings } from '@shared/types'

const SETTINGS_FILE = 'app-settings.json'

function settingsFilePath(): string {
  return join(app.getPath('userData'), SETTINGS_FILE)
}

function defaultDataDir(): string {
  return join(app.getPath('userData'), 'data')
}

export function readSettings(): AppSettings {
  const filePath = settingsFilePath()
  if (!existsSync(filePath)) {
    return { dataDirPath: defaultDataDir() }
  }
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return { dataDirPath: parsed.dataDirPath ?? defaultDataDir() }
  } catch {
    return { dataDirPath: defaultDataDir() }
  }
}

export function writeSettings(settings: AppSettings): void {
  const filePath = settingsFilePath()
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8')
}
