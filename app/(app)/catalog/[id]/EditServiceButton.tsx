'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ServiceSheet } from '../ServiceSheet'
import type { ServiceListItem, TemplateOption } from '@/lib/actions/catalog'

type Props = {
  service: ServiceListItem
  categories: string[]
  paymentTemplates: TemplateOption[]
  tcTemplates: TemplateOption[]
}

export function EditServiceButton({
  service,
  categories,
  paymentTemplates,
  tcTemplates,
}: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        size="sm"
        className="gap-1.5 min-h-[40px]"
        onClick={() => setOpen(true)}
      >
        <Pencil size={14} />
        Edit
      </Button>

      <ServiceSheet
        open={open}
        onOpenChange={setOpen}
        service={service}
        categories={categories}
        paymentTemplates={paymentTemplates}
        tcTemplates={tcTemplates}
      />
    </>
  )
}
