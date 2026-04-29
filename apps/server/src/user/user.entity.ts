import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  telegramId!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32, nullable: true })
  nickname!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
