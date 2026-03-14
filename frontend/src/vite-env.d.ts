/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WC_PROJECT_ID: string
  readonly VITE_TOKEN_ADDRESS: string
  readonly VITE_PAYROLL_ADDRESS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
