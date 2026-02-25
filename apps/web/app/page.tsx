import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-50 to-white">
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-brand-700">КлипМейкер</h1>
        <div className="flex gap-4">
          <Link href="/login" className="px-4 py-2 text-brand-600 hover:text-brand-700">
            Войти
          </Link>
          <Link
            href="/register"
            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700"
          >
            Начать бесплатно
          </Link>
        </div>
      </nav>

      <section className="text-center py-20 px-6 max-w-4xl mx-auto">
        <h2 className="text-5xl font-bold text-gray-900 mb-6">
          Вебинар → 10 шортсов за 5 минут
        </h2>
        <p className="text-xl text-gray-600 mb-8">
          AI нарезает лучшие моменты, добавляет русские субтитры
          и публикует в VK, Rutube, Дзен и Telegram
        </p>
        <Link
          href="/register"
          className="inline-block px-8 py-4 bg-brand-600 text-white text-lg rounded-lg hover:bg-brand-700 transition"
        >
          Попробовать бесплатно — 30 минут
        </Link>
      </section>

      <section className="py-16 px-6 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <FeatureCard
            title="AI-нарезка"
            description="Находит вирусные моменты и ранжирует по Virality Score 0-100"
          />
          <FeatureCard
            title="Русские субтитры"
            description="Whisper STT с точностью 95%+, редактор субтитров в браузере"
          />
          <FeatureCard
            title="Авто-постинг"
            description="Публикация в VK Clips, Rutube, Дзен и Telegram по расписанию"
          />
        </div>
      </section>
    </main>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-6 rounded-xl border border-gray-200 hover:shadow-lg transition">
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}
