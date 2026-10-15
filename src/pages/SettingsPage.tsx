import { useState, type ReactNode } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { parseBackup } from '@/domain/backup'
import * as finance from '@/db/finance-repository'
import { useFinance } from '@/state/FinanceContext'
import { Button } from '@/components/ui/button'
import { Field, TextInput } from '@/components/ui/field'
import { ConfirmDialog } from '@/components/ui/sheet'

export function SettingsPage() {
  const { snapshot, mutate, reload, competence } = useFinance()
  const [message, setMessage] = useState<string | null>(null)
  const [backupErrors, setBackupErrors] = useState<string[]>([])
  const [pendingBackup, setPendingBackup] = useState<unknown>(null)
  const [accepted, setAccepted] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)

  if (!snapshot) return <p>Carregando ajustes...</p>
  const lastBackup = snapshot.settings.lastBackupAt
    ? format(new Date(snapshot.settings.lastBackupAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
    : null

  async function exportBackup() {
    const backup = await finance.exportBackup()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `personal-finance-backup-${backup.exportedAt.slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    await reload()
    setMessage('Backup baixado. Guarde o arquivo fora do navegador.')
  }

  async function onFile(file: File | undefined) {
    setBackupErrors([])
    setPendingBackup(null)
    setAccepted(false)
    if (!file) return
    try {
      const raw: unknown = JSON.parse(await file.text())
      const parsed = parseBackup(raw)
      if (!parsed.ok) {
        setBackupErrors(parsed.errors)
        return
      }
      setPendingBackup(raw)
    } catch {
      setBackupErrors(['O arquivo não é um JSON válido. Nenhum dado local foi alterado.'])
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Ajustes</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Os lançamentos ficam no arquivo data/finance.json no servidor da aplicação. O navegador só exibe o que esse arquivo contém. Exporte um backup para recuperar ou migrar.
        </p>
      </header>
      {message ? <p className="rounded-2xl bg-secondary px-4 py-3 text-sm text-income">{message}</p> : null}

      <Section title="Backup">
        <p className="text-sm text-muted-foreground">
          {lastBackup ? `Último backup: ${lastBackup}.` : 'Nenhum backup registrado na base.'}
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => void exportBackup()}>Exportar backup JSON</Button>
        </div>
        <Field label="Restaurar backup" hint="O arquivo é validado antes de qualquer substituição.">
          <TextInput
            type="file"
            accept="application/json,.json"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
        </Field>
        {backupErrors.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-expense" role="alert">
            {backupErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
        {pendingBackup ? (
          <div className="rounded-2xl border border-border p-3">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
              Substituir todos os dados do servidor pelo conteúdo do arquivo.
            </label>
            <Button
              className="mt-3"
              variant="destructive"
              disabled={!accepted}
              onClick={() =>
                void mutate(() => finance.importBackup(pendingBackup), 'Backup restaurado.')
                  .then(() => {
                    setPendingBackup(null)
                    setAccepted(false)
                  })
                  .catch((error: unknown) => setBackupErrors([error instanceof Error ? error.message : 'Falha ao restaurar.']))
              }
            >
              Restaurar agora
            </Button>
          </div>
        ) : null}
      </Section>

      <Section title="Dados de exemplo e limpeza">
        <p className="text-sm text-muted-foreground">
          O exemplo só entra se ainda não houver lançamentos seus. Tudo fica identificado com [Exemplo]. A competência atual continua sendo {competence}.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => void mutate(() => finance.loadDemoData(), 'Dados de exemplo carregados.')}>
            Carregar exemplo
          </Button>
          <Button variant="outline" onClick={() => void mutate(() => finance.clearDemoData(), 'Exemplo removido.')}>
            Remover exemplo
          </Button>
          <Button variant="destructive" onClick={() => setClearOpen(true)}>
            Apagar todos os dados
          </Button>
        </div>
      </Section>

      <ConfirmDialog
        open={clearOpen}
        title="Apagar todos os dados do servidor"
        description="Esta ação remove lançamentos, baixas, cartões, recorrências e categorias personalizadas do arquivo do servidor. Exporte um backup antes se quiser recuperá-los."
        confirmLabel="Apagar dados"
        destructive
        onOpenChange={setClearOpen}
        onConfirm={() => {
          setClearOpen(false)
          void mutate(() => finance.clearAllData(), 'Dados locais apagados.')
        }}
      />
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}
