"use client";

import { useState, useEffect } from "react";
import { useFetch } from "@/hooks/useFetch";
import { Participant } from "@/lib/types";

export function useScannedParticipants() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const { fetch, loading, error } = useFetch<Participant[]>();

  useEffect(() => {
    const loadParticipants = async () => {
      const data = await fetch("/api/scan");
      if (data) {
        setParticipants(data);
      }
    };

    loadParticipants();
  }, [fetch]);

  const addParticipant = (participant: Participant) => {
    // Add to beginning of list
    setParticipants((prev) => [participant, ...prev]);
  };

  return { participants, loading, error, addParticipant };
}
