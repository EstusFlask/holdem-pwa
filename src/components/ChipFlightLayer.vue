<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ChipFlight } from '../services/animator'
import { chipAssetUrl, largestChip } from '../services/chips'

const props = defineProps<{
  flights: ChipFlight[]
  /** Stage element the seats live in; flights are measured against it. */
  stage: HTMLElement | null
  chipTheme: string
}>()

interface PlacedFlight extends ChipFlight {
  fromX: number
  fromY: number
  /** Disc that matches what this seat is pushing in. */
  src: string
}

const placed = ref<PlacedFlight[]>([])

/**
 * Seat positions are CSS-driven (percentages, clamps, safe-area insets), so the
 * only reliable source for where a plate sits is the DOM itself. Each flight is
 * measured once, at the moment it starts, against the stage centre.
 */
function place(flights: ChipFlight[]): PlacedFlight[] {
  const stage = props.stage
  if (!stage || !flights.length) return []
  const bounds = stage.getBoundingClientRect()
  const centreX = bounds.left + bounds.width / 2
  const centreY = bounds.top + bounds.height / 2

  return flights.flatMap((flight) => {
    const seat = stage.querySelector<HTMLElement>(`[data-seat-player="${CSS.escape(flight.playerId)}"]`)
    if (!seat) return []
    const seatBounds = seat.getBoundingClientRect()
    return [{
      ...flight,
      fromX: Math.round(seatBounds.left + seatBounds.width / 2 - centreX),
      fromY: Math.round(seatBounds.top + seatBounds.height / 2 - centreY),
      src: chipAssetUrl(props.chipTheme, largestChip(flight.amount)),
    }]
  })
}

watch(() => props.flights, (flights) => { placed.value = place(flights) }, { immediate: true })

const hasFlights = computed(() => placed.value.length > 0)
</script>

<template>
  <div v-if="hasFlights" class="chip-flights" aria-hidden="true">
    <img
      v-for="flight in placed"
      :key="flight.id"
      class="chip-flight"
      :src="flight.src"
      alt=""
      :style="{ '--from-x': `${flight.fromX}px`, '--from-y': `${flight.fromY}px` }"
    />
  </div>
</template>
