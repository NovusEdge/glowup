import { useState } from 'react'
import { STATUS_FIELD_IDS, type StatusFieldId } from '../landing/data.ts'
import { editSetup, type StudioSetup } from './model.ts'
import { Order } from './ui'

const LABEL: Record<StatusFieldId, string> = {
  activity: 'Activity', ctx: 'Context', '5h': '5-hour limit', week: 'Weekly limit', cost: 'Cost', model: 'Model',
  effort: 'Effort', agents: 'Agents', plan: 'Plan', branch: 'Branch', changes: 'Changes', cwd: 'Folder', level: 'Level',
}

export function StatusSection({ setup, onSetup, onTier }: { setup: StudioSetup; onSetup(s: StudioSetup): void; onTier(w: 'narrow' | 'wide'): void }) {
  const [notice, setNotice] = useState<string>()
  return (
    <>
      <p className="st-err" role="status">{notice}</p>
      <Order
        title="Status line fields" all={STATUS_FIELD_IDS} active={setup.statusline} labels={LABEL}
        onChange={statusline => {
          const r = editSetup(setup, { statusline })
          setNotice(r.notice)
          if (r.notice) return
          onSetup(r.setup)
          onTier('wide')
        }}
      />
    </>
  )
}
