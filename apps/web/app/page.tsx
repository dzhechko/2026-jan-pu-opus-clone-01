import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

const features = [
  {
    icon: '🎬',
    title: 'AI-нарезка',
    description: 'Находит самые вирусные моменты вебинара и ранжирует по Virality Score 0–100',
  },
  {
    icon: '💬',
    title: 'Русские субтитры',
    description: 'Whisper STT с точностью 95%+, встроенный редактор субтитров прямо в браузере',
  },
  {
    icon: '📡',
    title: 'Авто-постинг',
    description: 'Публикация в VK Clips, Rutube, Дзен и Telegram одной кнопкой по расписанию',
  },
  {
    icon: '🔒',
    title: 'Ваши ключи — ваш контроль',
    description: 'BYOK: API-ключи шифруются в браузере (AES-256), сервер их никогда не видит',
  },
  {
    icon: '🇷🇺',
    title: 'Данные в РФ',
    description: 'Cloud.ru для AI, российский VPS для видео. Соответствие 152-ФЗ',
  },
  {
    icon: '⚡',
    title: '0.34₽ / минута',
    description: 'Дешевле конкурентов в 10 раз. Free-план: 30 минут бесплатно каждый месяц',
  },
];

const steps = [
  { step: '1', title: 'Загрузите видео', description: 'Или вставьте ссылку — поддерживаем до 4 ГБ' },
  { step: '2', title: 'AI анализирует', description: 'Транскрипция, поиск моментов, оценка вирусности' },
  { step: '3', title: 'Получите шортсы', description: '10 готовых клипов с субтитрами за 5 минут' },
  { step: '4', title: 'Опубликуйте', description: 'Авто-постинг во все площадки одним кликом' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b">
        <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
          <Link href="/" className="text-2xl font-bold tracking-tight text-primary">
            КлипМейкер
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link href="/login">Войти</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Начать бесплатно</Link>
            </Button>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <Badge variant="secondary" className="text-sm px-4 py-1">
            Первый AI-клипмейкер для российских платформ
          </Badge>
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-foreground">
            Вебинар → 10 шортсов
            <span className="text-primary"> за 5 минут</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            AI нарезает лучшие моменты, добавляет русские субтитры
            и публикует в VK, Rutube, Дзен и Telegram
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button size="lg" className="text-lg px-8 py-6" asChild>
              <Link href="/register">Попробовать бесплатно</Link>
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8 py-6" asChild>
              <Link href="#how-it-works">Как это работает</Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            30 минут бесплатно каждый месяц. Без привязки карты.
          </p>
        </div>
      </section>

      <Separator />

      {/* How it works */}
      <section id="how-it-works" className="py-20 px-6 bg-muted/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Как это работает</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((s) => (
              <div key={s.step} className="text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mx-auto">
                  {s.step}
                </div>
                <h3 className="font-semibold text-lg">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Separator />

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Возможности</h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            Всё что нужно авторам онлайн-курсов для превращения вебинаров в промо-контент
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <Card key={f.title} className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="text-3xl mb-2">{f.icon}</div>
                  <CardTitle className="text-lg">{f.title}</CardTitle>
                  <CardDescription>{f.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <Separator />

      {/* CTA */}
      <section className="py-20 px-6 bg-primary text-primary-foreground">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <h2 className="text-3xl font-bold">
            Хватит тратить 2–3 часа на ручную нарезку
          </h2>
          <p className="text-lg opacity-90">
            Зарубежные инструменты не поддерживают VK и Rutube.
            КлипМейкер — первое решение для российского рынка.
          </p>
          <Button size="lg" variant="secondary" className="text-lg px-8 py-6" asChild>
            <Link href="/register">Начать бесплатно — 30 минут</Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>КлипМейкер © {new Date().getFullYear()}</span>
          <div className="flex gap-6">
            <span>Данные хранятся в РФ (152-ФЗ)</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
