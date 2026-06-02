import PracticeClient from "./PracticeClient";

export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; filter?: string }>;
}) {
  const params = await searchParams;
  return (
    <PracticeClient
      typeParam={params.type}
      filterParam={params.filter as "wrong" | "favorite" | undefined}
    />
  );
}
