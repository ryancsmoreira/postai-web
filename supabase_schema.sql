-- =====================================================================
-- POSTAI — SCRIPT DE CONFIGURAÇÃO DO BANCO DE DADOS (SUPABASE / POSTGRES)
-- Cole o código abaixo no editor SQL (SQL Editor) do seu painel Supabase.
-- Todas as tabelas iniciam com o prefixo "web_" para evitar conflitos.
-- =====================================================================

-- Habilita a extensão de geração de UUIDs aleatórios se não estiver ativa
create extension if not exists "uuid-ossp";

-- 1. Tabela de Academias
create table public.web_academies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Tabela de Usuários (Contas administrativas e videomakers)
create table public.web_users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null check (role in ('admin', 'videomaker')),
  academy_id uuid references public.web_academies(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Habilita RLS (Row Level Security) na tabela web_users
alter table public.web_users enable row level security;

-- 3. Tabela de Vídeos enviados pelos videomakers
create table public.web_videos (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique, -- Hash de 6 caracteres maiúsculos gerado no upload
  academy_id uuid references public.web_academies(id) on delete cascade,
  videomaker_id uuid references public.web_users(id) on delete set null,
  student_name text not null,
  student_phone text not null,
  file_url text not null, -- URL pública do arquivo no Cloudflare R2 / Worker
  qr_code_url text, -- Caminho de redirecionamento interno
  downloads integer default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Habilita RLS na tabela web_videos
alter table public.web_videos enable row level security;

-- 4. Tabela de Leads capturados quando o aluno preenche o formulário
create table public.web_leads (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references public.web_videos(id) on delete cascade not null,
  name text not null,
  phone text not null,
  instagram text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Habilita RLS na tabela web_leads
alter table public.web_leads enable row level security;


-- =====================================================================
-- CONFIGURAÇÃO DE POLÍTICAS DE RLS (SEGURANÇA DO BANCO DE DADOS)
-- =====================================================================

-- Políticas para ACADEMIAS (web_academies)
create policy "Leitura pública de academias" 
  on public.web_academies for select 
  using (true);

create policy "Administradores podem modificar academias" 
  on public.web_academies for all
  using (
    exists (
      select 1 from public.web_users
      where web_users.id = auth.uid() and web_users.role = 'admin'
    )
  );

-- Políticas para USUÁRIOS (web_users)
create policy "Usuários autenticados podem ver perfis"
  on public.web_users for select
  using (auth.role() = 'authenticated');

-- Políticas para VÍDEOS (web_videos)
create policy "Qualquer pessoa pode buscar um vídeo por ID público" 
  on public.web_videos for select 
  using (true);

create policy "Usuários autenticados podem registrar vídeos" 
  on public.web_videos for insert 
  with check (auth.role() = 'authenticated');

create policy "Usuários autenticados podem ver listagem de vídeos"
  on public.web_videos for select
  using (auth.role() = 'authenticated');

-- Políticas para LEADS (web_leads)
create policy "Qualquer pessoa pode enviar um lead"
  on public.web_leads for insert
  with check (true);

create policy "Usuários autenticados podem ver os leads"
  on public.web_leads for select
  using (auth.role() = 'authenticated');


-- =====================================================================
-- TRIGGER PARA SINCRONIZAÇÃO AUTOMÁTICA DE USUÁRIOS (AUTH -> PUBLIC)
-- Sempre que um usuário for registrado (ex: via Admin), seu perfil público
-- será criado na tabela public.web_users automaticamente.
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.web_users (id, name, email, role, academy_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'Usuário'),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'videomaker'),
    case 
      when new.raw_user_meta_data->>'academy_id' is not null 
      then (new.raw_user_meta_data->>'academy_id')::uuid 
      else null 
    end
  );
  return new;
end;
$$ language plpgsql security definer;

-- Remove a trigger caso ela já exista para evitar erros de reexecução
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- =====================================================================
-- EXEMPLO DE CRIAÇÃO DO PRIMEIRO ADMINISTRADOR (OPCIONAL)
-- Para criar o primeiro administrador manualmente, primeiro crie o usuário
-- pelo painel de Autenticação do Supabase (Authentication -> Users -> Add User)
-- e depois rode o comando SQL abaixo substituindo o e-mail:
--
-- UPDATE public.web_users SET role = 'admin' WHERE email = 'email_do_admin@dominio.com';
-- =====================================================================
