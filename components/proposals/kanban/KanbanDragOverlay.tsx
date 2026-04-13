'use client'

import { DragOverlay } from '@dnd-kit/core'
import { KanbanCard } from './KanbanCard'
import type { ProposalListItem } from '@/lib/actions/proposals'

type Props = {
  activeId: string | null
  proposals: ProposalListItem[]
  currentUserId: string
  currentUserRole: string
}

export function KanbanDragOverlay({ activeId, proposals, currentUserId, currentUserRole }: Props) {
  const active = activeId ? proposals.find((p) => p.id === activeId) : null

  return (
    <DragOverlay dropAnimation={null}>
      {active ? (
        <div className="w-[280px]">
          <KanbanCard
            proposal={active}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            isDragOverlay
          />
        </div>
      ) : null}
    </DragOverlay>
  )
}
