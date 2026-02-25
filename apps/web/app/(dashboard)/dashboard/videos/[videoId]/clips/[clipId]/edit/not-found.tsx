import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <h1 className="text-2xl font-bold">Клип не найден</h1>
      <p className="text-muted-foreground">
        Клип не существует или у вас нет доступа.
      </p>
      <Link href="/dashboard" className="text-primary underline">
        Вернуться в дашборд
      </Link>
    </div>
  );
}
